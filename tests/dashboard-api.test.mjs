import assert from "node:assert/strict"
import test from "node:test"

import { interview, log, setupRoute, smallFixture, summarize } from "./consumption-fixture.mjs"

const setup = (options) => setupRoute("dashboard", options)
const expectedError = { error: "We couldn't load your usage. Please try again." }

test("summary requires authentication before connecting", async () => {
  const api = setup()
  const response = await api.get("", false)
  assert.equal(response.status, 401)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(api.connected(), 0)
})

test("returns the validated raw-log summary with text counts and timestamp preservation", async () => {
  const api = setup()
  const response = await api.get()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.summary, summarize(smallFixture()))
  assert.deepEqual(Object.keys(body).sort(), ["summary", "updatedAt"])
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)))
  assert.equal(api.queries.length, 4)
  assert.equal(api.queries[0].sql, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.equal(api.queries.at(-1).sql, "COMMIT")
  const query = api.queries.find(({ sql }) => sql.includes("AS usage_summary")).sql
  for (const field of ["api_consumption_all", "distinct_interviews", "first_used", "last_used"]) {
    assert.ok(query.includes(`${field}::text AS ${field}`))
  }
  assert.match(query, /FROM webhook_logs_am\) AS usage_summary/)
  const validation = api.queries.find(({ sql }) => sql.includes("AS reconciliation")).sql
  assert.match(validation, /WHERE interview_id IS NULL OR matching_interviews <> 1/)
  assert.match(validation, /FROM public\.interviews_am AS i/)
  assert.doesNotMatch(query + validation, /api_usage|api_key_prefix|success|LIMIT|OFFSET/)
  assert.equal(api.released(), 1)
})

test("zero consumption and null first/last times remain valid", async () => {
  const response = await setup({ fixture: { interviews: [], logs: [] } }).get()
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).summary, {
    api_consumption_all: "0", distinct_interviews: "0", first_used: null, last_used: null,
  })
})

test("huge consumption counts are preserved without Number conversion", async () => {
  const summary = { ...summarize(smallFixture()), api_consumption_all: "900719925474099312345" }
  const api = setup({ summaryRows: [summary], reconciliationRows: [{ ...summary, invalid_interviews: "0" }] })
  const response = await api.get()
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).summary, summary)
})

test("summary must contain exactly one row with valid counts and timestamp text", async () => {
  const valid = summarize(smallFixture())
  const cases = [[], [valid, valid]]
  for (const field of ["api_consumption_all", "distinct_interviews"]) {
    for (const value of ["invalid", "-1", "1.5", "1e2", "", " 1", 1, null, undefined]) {
      cases.push([{ ...valid, [field]: value }])
    }
  }
  cases.push([{ ...valid, first_used: undefined }], [{ ...valid, last_used: new Date() }])
  for (const summaryRows of cases) {
    const api = setup({ summaryRows })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("all four configured aggregate fields must match the raw-log snapshot", async () => {
  const actual = summarize(smallFixture())
  for (const override of [
    { api_consumption_all: "4" }, { distinct_interviews: "3" },
    { first_used: null }, { last_used: "2026-10-07 12:00:00+00" },
  ]) {
    const api = setup({ summaryRows: [{ ...actual, ...override }] })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("null log IDs, missing AM records, and duplicate AM IDs fail reconciliation", async () => {
  for (const mutate of [
    (fixture) => fixture.logs.push(log(null, null)),
    (fixture) => fixture.logs.push(log("orphan", null)),
    (fixture) => fixture.interviews.push(interview(4, { interview_id: "am-1" })),
  ]) {
    const fixture = smallFixture()
    mutate(fixture)
    const api = setup({ fixture })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("malformed reconciliation rows fail safely", async () => {
  const actual = { ...summarize(smallFixture()), invalid_interviews: "0" }
  for (const reconciliationRows of [[], [actual, actual], [{ ...actual, invalid_interviews: "invalid" }], [{ ...actual, api_consumption_all: null }]]) {
    const api = setup({ reconciliationRows })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("transaction failures return generic errors, roll back, and release the connection", async () => {
  for (const failAt of ["BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", "summary", "reconciliation", "COMMIT"]) {
    const api = setup({ failAt, failRollback: failAt === "reconciliation" })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("missing configuration and connection failures do not expose details", async () => {
  for (const options of [{ configured: false }, { query: "" }, { query: " \n\t" }, { query: ";" }, { connectFail: true }]) {
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.deepEqual(api.queries, [])
    assert.equal(api.released(), 0)
  }
})
