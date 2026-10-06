import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { NextRequest } = require("next/server")
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

const totalRow = (overrides = {}) => ({
  environment_and_key: "TOTAL (all keys)",
  webhook_deliveries: "0",
  first_used: null,
  last_used: null,
  ...overrides,
})
const environmentRow = (overrides = {}) => ({
  environment_and_key: "Production (original key)",
  webhook_deliveries: "1",
  first_used: "2026-10-01 12:34:56.123456+05:30",
  last_used: "2026-10-06 12:34:56.654321",
  ...overrides,
})

function setup({ rows = [totalRow()], failAt, failRollback = false, connectFail = false, configured = true, query = "SELECT * FROM usage_fixture;\n" } = {}) {
  const queries = []
  let connected = 0
  let released = 0
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql === failAt || (failAt === "usage" && sql.includes("AS usage"))) {
        throw new Error("Private connection details")
      }
      if (sql === "ROLLBACK" && failRollback) throw new Error("Private rollback details")
      if (sql.includes("AS usage")) {
        return { rows }
      }
      return { rows: [] }
    },
    release() { released++ },
  }
  const routeModule = { exports: {} }
  const load = (name) => {
    if (name === "@/lib/db") return { default: { async connect() {
      connected++
      if (connectFail) throw new Error("Private connection details")
      return client
    } } }
    if (name === "@/lib/auth") return { AUTH_SESSION_COOKIE_NAME: "session", isSessionValid: (value) => value === "valid" }
    return require(name)
  }
  const environment = { env: configured ? { DB_QUERY_1: query } : {} }
  runInThisContext(`(function(require, module, exports, process, console) { ${compiled}\n})`)(load, routeModule, routeModule.exports, environment, { error() {} })
  return {
    queries, connected: () => connected, released: () => released,
    get: (authorized = true) => routeModule.exports.GET(new NextRequest("http://localhost/api/dashboard", {
      headers: authorized ? { cookie: "session=valid" } : {},
    })),
  }
}

test("usage requires authentication before connecting", async () => {
  const api = setup()
  const response = await api.get(false)
  assert.equal(response.status, 401)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal(api.connected(), 0)
})

test("executes one rollup query and extracts the total while preserving counts and timestamp text", async () => {
  const rows = Array.from({ length: 61 }, (_, index) => environmentRow({ environment_and_key: `Environment ${index}`, webhook_deliveries: String(100 - index) }))
  const total = totalRow({ webhook_deliveries: "900719925474099312345", first_used: "2026-10-01 12:34:56.123456+05:30", last_used: "2026-10-06 12:34:56.654321" })
  const api = setup({ rows: [total, ...rows] })
  const response = await api.get()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.rows, rows)
  assert.deepEqual(body.total, total)
  assert.deepEqual(Object.keys(body).sort(), ["rows", "total", "updatedAt"])
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)))
  const statsQuery = api.queries.find(sql => sql.includes("AS usage"))
  assert.match(statsQuery, /webhook_deliveries::text AS webhook_deliveries/)
  assert.match(statsQuery, /first_used::text AS first_used/)
  assert.match(statsQuery, /last_used::text AS last_used/)
  assert.match(statsQuery, /FROM \(SELECT \* FROM usage_fixture\) AS usage/)
  assert.match(statsQuery, /ORDER BY usage.webhook_deliveries::numeric DESC, environment_and_key ASC/)
  assert.doesNotMatch(statsQuery, /LIMIT|OFFSET/)
  assert.equal(api.queries.length, 3)
  assert.equal(api.queries[0], "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.equal(api.queries.at(-1), "COMMIT")
  assert.equal(api.released(), 1)
})

test("empty groups and zero total with null timestamps remain valid", async () => {
  const response = await setup().get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.rows, [])
  assert.deepEqual(body.total, totalRow())
})

test("environment rows retain query ordering when the total appears between groups", async () => {
  const rows = [
    environmentRow({ environment_and_key: "Production (original key)", webhook_deliveries: "10" }),
    environmentRow({ environment_and_key: "Dev/Staging (new key)", webhook_deliveries: "2", first_used: null }),
    environmentRow({ environment_and_key: "Production (new key)", webhook_deliveries: "2", last_used: null }),
  ]
  const total = totalRow({ webhook_deliveries: "14" })
  const response = await setup({ rows: [rows[0], total, ...rows.slice(1)] }).get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.rows, rows)
  assert.deepEqual(body.total, total)
})

test("missing and duplicate total rows roll back with generic errors", async () => {
  for (const rows of [[], [environmentRow()], [totalRow(), totalRow()]]) {
    const api = setup({ rows })
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    assert.equal(api.queries.at(-1), "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("invalid counts in total and environment rows roll back", async () => {
  for (const webhook_deliveries of ["invalid", "-1", "1.5", "1e2", "", " 1", 1, null, undefined]) {
    for (const rows of [
      [totalRow({ webhook_deliveries })],
      [totalRow(), environmentRow({ webhook_deliveries })],
    ]) {
      const api = setup({ rows })
      const response = await api.get()
      assert.equal(response.status, 500)
      assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
      assert.equal(api.queries.at(-1), "ROLLBACK")
      assert.equal(api.released(), 1)
    }
  }
})

test("transaction failures roll back with generic errors and release the connection", async () => {
  for (const failAt of ["BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY", "usage", "COMMIT"]) {
    const options = { failAt }
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
    assert.equal(api.queries.at(-1), "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("rollback failure still releases the connection", async () => {
  const api = setup({ failAt: "usage", failRollback: true })
  assert.equal((await api.get()).status, 500)
  assert.equal(api.queries.at(-1), "ROLLBACK")
  assert.equal(api.released(), 1)
})

test("missing or blank query configuration fails before connecting", async () => {
  for (const options of [{ configured: false }, { query: "" }, { query: " \n\t" }]) {
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
    assert.equal(api.connected(), 0)
    assert.equal(api.released(), 0)
  }
})

test("connection failures return a generic error without attempting release or rollback", async () => {
  const api = setup({ connectFail: true })
  const response = await api.get()
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
  assert.deepEqual(api.queries, [])
  assert.equal(api.released(), 0)
})
