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

function setup({ rows = [], total = "0", fail = false, configured = true } = {}) {
  const queries = []
  let connected = 0
  let released = 0
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes("AS summary")) return { rows: [{ total_requests: total }] }
      if (sql.includes("AS usage")) {
        if (fail) throw new Error("Private connection details")
        return { rows }
      }
      return { rows: [] }
    },
    release() { released++ },
  }
  const routeModule = { exports: {} }
  const load = (name) => {
    if (name === "@/lib/db") return { default: { async connect() { connected++; return client } } }
    if (name === "@/lib/auth") return { AUTH_SESSION_COOKIE_NAME: "session", isSessionValid: (value) => value === "valid" }
    return require(name)
  }
  const environment = { env: configured ? { DB_QUERY_1: "SELECT * FROM summary_fixture;", DB_QUERY_2: "SELECT * FROM usage_fixture;" } : {} }
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

test("returns every usage group without pagination and preserves large counts", async () => {
  const rows = Array.from({ length: 61 }, (_, index) => ({ environment_and_key: `Environment ${index}`, total_requests: String(100 - index) }))
  const api = setup({ rows, total: "900719925474099312345" })
  const response = await api.get()
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.rows, rows)
  assert.equal(body.totalRequests, "900719925474099312345")
  assert.deepEqual(Object.keys(body).sort(), ["rows", "totalRequests", "updatedAt"])
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)))
  const statsQuery = api.queries.find(sql => sql.includes("AS usage"))
  assert.match(statsQuery, /ORDER BY usage.total_requests::numeric DESC, environment_and_key ASC/)
  assert.doesNotMatch(statsQuery, /LIMIT|OFFSET|first_used|last_used/)
  assert.equal(api.queries.length, 4)
  assert.equal(api.queries[0], "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.equal(api.queries.at(-1), "COMMIT")
  assert.equal(api.released(), 1)
})

test("empty groups and zero totals remain valid", async () => {
  const response = await setup().get()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.rows, [])
  assert.equal(body.totalRequests, "0")
})

test("query failures and invalid totals roll back with generic errors", async () => {
  for (const options of [{ fail: true }, { total: "invalid" }]) {
    const api = setup(options)
    const response = await api.get()
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: "We couldn't load your usage. Please try again." })
    assert.equal(api.queries.at(-1), "ROLLBACK")
    assert.equal(api.released(), 1)
  }
})

test("missing query configuration fails before connecting", async () => {
  const api = setup({ configured: false })
  assert.equal((await api.get()).status, 500)
  assert.equal(api.connected(), 0)
})
