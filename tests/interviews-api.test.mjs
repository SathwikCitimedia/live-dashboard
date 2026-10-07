import assert from "node:assert/strict"
import test from "node:test"

import { interview, log, setupRoute, smallFixture, summarize } from "./consumption-fixture.mjs"

const setup = (options) => setupRoute("interviews", options)
const expectedError = { error: "We couldn't load interviews. Please try again." }

test("requires a session before connecting to the database", async () => {
  const api = setup()
  const response = await api.get("", false)
  assert.equal(response.status, 401)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(api.connected(), 0)
})

test("rejects invalid or unsafe pagination before connecting", async () => {
  for (const query of ["?page=0", "?page=-1", "?page=1.5", "?page=01", "?page=9007199254740992", "?page=1%20OR%201=1", "?pageSize=100", "?pageSize=010", "?pageSize="]) {
    const api = setup()
    assert.equal((await api.get(query)).status, 400, query)
    assert.equal(api.connected(), 0)
  }
})

test("returns only AM interviews represented in raw webhook logs with exact consumption and dates", async () => {
  const fixture = smallFixture()
  fixture.interviews[0].security_token = "private"
  const api = setup({ fixture })
  const response = await api.get()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.summary, summarize(fixture))
  assert.deepEqual(body.pagination, { page: 1, pageSize: 10, totalRows: 2, totalPages: 1 })
  assert.deepEqual(body.rows.map(({ interview_id, api_consumption, status }) => ({ interview_id, api_consumption, status })), [
    { interview_id: "am-1", api_consumption: "2", status: "completed" },
    { interview_id: "am-2", api_consumption: "1", status: "in_progress" },
  ])
  assert.equal(body.rows[0].first_used, fixture.logs[0].created_at)
  assert.equal(body.rows[0].last_used, fixture.logs[1].created_at)
  assert.equal(body.rows[0].session_id, null)
  assert.equal(body.summary.api_consumption_all, "3", "includes failed logs without an API usage join")
  assert.deepEqual(Object.keys(body.rows[0]).sort(), [
    "api_consumption", "candidate_email", "candidate_name", "first_used", "id", "interview_id", "last_used", "role", "session_id", "status",
  ])
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)))
  assert.equal(api.queries.length, 5)
  assert.equal(api.queries[0].sql, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.equal(api.queries.at(-1).sql, "COMMIT")
  const pageQuery = api.queries.find(({ sql }) => sql.includes("LIMIT $1"))
  assert.match(pageQuery.sql, /FROM public\.webhook_logs_am\s+GROUP BY interview_id/)
  assert.match(pageQuery.sql, /FROM public\.interviews_am AS i\s+JOIN webhook_usage AS usage ON usage\.interview_id = i\.interview_id/)
  assert.match(pageQuery.sql, /ORDER BY usage\.last_used DESC NULLS LAST, i\.id DESC/)
  assert.match(pageQuery.sql, /usage\.api_consumption::text AS api_consumption/)
  assert.match(pageQuery.sql, /usage\.first_used::text AS first_used, usage\.last_used::text AS last_used/)
  assert.doesNotMatch(pageQuery.sql, /security_token|security_hash|api_usage|api_key_prefix|success|FROM interviews\b|SELECT\s+\*/i)
  assert.equal(api.released(), 1)
})

test("482 raw logs reconcile to 290 unique interviews across every filtered page", async () => {
  const fixture = { interviews: [], logs: [] }
  for (let id = 1; id <= 290; id++) {
    fixture.interviews.push(interview(id, { status: ["completed", "pending", "in_progress", "failed"][id % 4] }))
    fixture.logs.push(log(`am-${id}`, `2026-10-${String(1 + id % 6).padStart(2, "0")} 12:00:00+00`, { success: id % 3 !== 0 }))
    if (id <= 192) fixture.logs.push(log(`am-${id}`, "2026-10-07 12:00:00+00", { success: false }))
  }
  fixture.interviews.push(interview(291))
  const api = setup({ fixture })
  const allRows = []
  for (let page = 1; page <= 12; page++) {
    const response = await api.get(`?page=${page}&pageSize=25`)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.deepEqual(body.summary, summarize(fixture))
    assert.equal(body.summary.api_consumption_all, "482")
    assert.equal(body.summary.distinct_interviews, "290")
    assert.deepEqual(body.pagination, { page, pageSize: 25, totalRows: 290, totalPages: 12 })
    allRows.push(...body.rows)
  }
  assert.equal(allRows.length, 290)
  assert.equal(new Set(allRows.map(({ interview_id }) => interview_id)).size, 290)
  assert.equal(allRows.reduce((sum, row) => sum + BigInt(row.api_consumption), 0n), 482n)
  assert.equal(allRows.some(({ id }) => id === 291), false)
  assert.deepEqual(new Set(allRows.map(({ status }) => status)), new Set(["completed", "pending", "in_progress", "failed"]))
  assert.deepEqual(allRows.slice(0, 3).map(({ id }) => id), [192, 191, 190])
  assert.equal(api.released(), 12)
})

test("clamps to filtered pages and uses parameterized offsets", async () => {
  const fixture = { interviews: [], logs: [] }
  for (let id = 1; id <= 26; id++) {
    fixture.interviews.push(interview(id))
    fixture.logs.push(log(`am-${id}`, "2026-10-07 12:00:00+00"))
  }
  fixture.interviews.push(interview(27))
  const api = setup({ fixture })
  const body = await (await api.get("?page=99&pageSize=25")).json()
  assert.deepEqual(body.pagination, { page: 2, pageSize: 25, totalRows: 26, totalPages: 2 })
  assert.deepEqual(body.rows.map(({ id }) => id), [1])
  const query = api.queries.find(({ sql }) => sql.includes("LIMIT $1"))
  assert.deepEqual(query.params, [25, 25])
})

test("orders null delivery times last and resolves ties by AM record ID", async () => {
  const fixture = {
    interviews: [interview(1), interview(2), interview(3)],
    logs: [log("am-1", null), log("am-2", "2026-10-07 12:00:00+00"), log("am-3", "2026-10-07 12:00:00+00")],
  }
  const body = await (await setup({ fixture }).get()).json()
  assert.deepEqual(body.rows.map(({ id }) => id), [3, 2, 1])
  assert.equal(body.rows[2].first_used, null)
  assert.equal(body.rows[2].last_used, null)
})

test("empty raw logs return zero summary, no rows, and page one", async () => {
  const api = setup({ fixture: { interviews: [interview(1)], logs: [] } })
  const response = await api.get("?page=5")
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.summary, { api_consumption_all: "0", distinct_interviews: "0", first_used: null, last_used: null })
  assert.deepEqual(body.rows, [])
  assert.deepEqual(body.pagination, { page: 1, pageSize: 10, totalRows: 0, totalPages: 1 })
  assert.equal(api.queries.at(-1).sql, "COMMIT")
  assert.equal(api.released(), 1)
})

test("summary, reconciliation and page use one snapshot despite new logs arriving", async () => {
  const fixture = smallFixture()
  const api = setup({ fixture, afterQuery(stage, liveFixture) {
    if (stage === "summary") liveFixture.logs.push(log("new-unmatched-id", "2026-10-07 12:00:00+00"))
  } })
  const firstResponse = await api.get()
  const body = await firstResponse.json()
  assert.equal(firstResponse.status, 200)
  assert.equal(body.summary.api_consumption_all, "3")
  assert.equal(body.rows.reduce((sum, row) => sum + BigInt(row.api_consumption), 0n), 3n)
  assert.equal((await api.get()).status, 500, "next snapshot detects the newly orphaned log")
})

test("orphan IDs, null IDs and duplicate AM matches fail without silently excluding logs", async () => {
  for (const mutate of [
    (fixture) => fixture.logs.push(log("orphan", null)),
    (fixture) => fixture.logs.push(log(null, null)),
    (fixture) => fixture.interviews.push(interview(4, { interview_id: "am-2" })),
  ]) {
    const fixture = smallFixture()
    mutate(fixture)
    const api = setup({ fixture })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.some(({ sql }) => sql.includes("LIMIT $1")), false)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("preserves raw and per-interview counts above Number's safe integer range", async () => {
  const huge = "900719925474099312345"
  const summary = { ...summarize(smallFixture()), api_consumption_all: String(BigInt(huge) + 1n) }
  const api = setup({
    summaryRows: [summary], reconciliationRows: [{ ...summary, invalid_interviews: "0" }],
    pageRows: [
      { ...interview(1), api_consumption: huge, first_used: summary.first_used, last_used: summary.last_used },
      { ...interview(2), api_consumption: "1", first_used: null, last_used: null },
    ],
  })
  const response = await api.get()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.rows[0].api_consumption, huge)
  assert.equal(body.summary.api_consumption_all, String(BigInt(huge) + 1n))
  assert.equal(body.pagination.totalRows, 2)
})

test("unsafe distinct counts and malformed page results fail safely", async () => {
  const summary = { ...summarize(smallFixture()), distinct_interviews: "9007199254740992" }
  const cases = [
    { summaryRows: [summary], reconciliationRows: [{ ...summary, invalid_interviews: "0" }] },
    { pageRows: [] },
    ...["-1", "0", "invalid", 2, null].map((api_consumption) => ({
      pageRows: [{ ...interview(1), api_consumption, first_used: null, last_used: null }],
    })),
  ]
  for (const options of cases) {
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("missing configuration and connection failures remain generic", async () => {
  for (const options of [{ configured: false }, { query: " \n" }, { connectFail: true }]) {
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(api.released(), 0)
    assert.deepEqual(api.queries, [])
  }
})

test("all transaction failure stages roll back and release, even when rollback fails", async () => {
  for (const failAt of ["BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", "summary", "reconciliation", "page", "COMMIT"]) {
    const api = setup({ failAt, failRollback: failAt === "page" })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), expectedError)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(api.queries.at(-1).sql, "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})
