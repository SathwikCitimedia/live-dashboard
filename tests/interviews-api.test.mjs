import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { NextRequest } = require("next/server")
const source = readFileSync(new URL("../app/api/interviews/route.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function setup({ total = "1", rows = [], fail = false } = {}) {
  const queries = []
  let connected = 0
  let released = 0
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      if (sql.includes("COUNT(*)")) {
        if (fail) throw new Error("private database connection details")
        return { rows: [{ total }] }
      }
      return { rows: sql.includes("LIMIT $1") ? rows : [] }
    },
    release() { released++ },
  }
  const routeModule = { exports: {} }
  const load = (name) => {
    if (name === "@/lib/db") return { default: { async connect() { connected++; return client } } }
    if (name === "@/lib/auth") return { AUTH_SESSION_COOKIE_NAME: "session", isSessionValid: (value) => value === "valid" }
    return require(name)
  }
  runInThisContext(`(function(require, module, exports, console) { ${compiled}\n})`)(load, routeModule, routeModule.exports, { error() {} })
  return {
    queries,
    connected: () => connected,
    released: () => released,
    get: (query = "", authorized = true) => routeModule.exports.GET(new NextRequest(`http://localhost/api/interviews${query}`, {
      headers: authorized ? { cookie: "session=valid" } : {},
    })),
  }
}

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

test("empty results return page one and commit a consistent read-only snapshot", async () => {
  const api = setup({ total: "0" })
  const response = await api.get("?page=5")
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.rows, [])
  assert.deepEqual(body.pagination, { page: 1, pageSize: 10, totalRows: 0, totalPages: 1 })
  assert.equal(api.queries[0].sql, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
  assert.equal(api.queries.at(-1).sql, "COMMIT")
  assert.equal(api.released(), 1)
})

test("clamps pages and uses deterministic ordering and parameterized pagination", async () => {
  const api = setup({ total: "26", rows: [{ id: 1 }] })
  const body = await (await api.get("?page=99&pageSize=25")).json()
  assert.deepEqual(body.pagination, { page: 2, pageSize: 25, totalRows: 26, totalPages: 2 })
  const query = api.queries.find(({ sql }) => sql.includes("LIMIT $1"))
  assert.deepEqual(query.params, [25, 25])
  assert.match(query.sql, /ORDER BY created_at DESC NULLS LAST, id DESC/)
})

test("selects no security fields and preserves dates, nulls, arrays, JSON, false, and zero", async () => {
  const row = {
    id: 4, interview_time: new Date("2026-09-08T12:30:00Z"),
    last_heartbeat_at: "2026-09-08 12:30:00.123456", last_socket_disconnect_at: null,
    abandoned_at: "2026-09-08 14:00:00", is_demo: false, reconnect_count: 0,
    candidate_phones: ["+123456789"], challenges: [], stream_response_config: { enabled: false },
  }
  const api = setup({ rows: [row] })
  const response = await api.get()
  const body = await response.json()
  const query = api.queries.find(({ sql }) => sql.includes("LIMIT $1"))
  assert.doesNotMatch(query.sql, /security_hash|security_token|SELECT\s+\*/i)
  for (const column of ["last_heartbeat_at", "last_socket_disconnect_at", "abandoned_at"]) {
    assert.ok(query.sql.includes(`${column}::text AS ${column}`))
  }
  assert.deepEqual(body.rows, [JSON.parse(JSON.stringify(row))])
  assert.doesNotMatch(JSON.stringify(body), /security_hash|security_token/)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.ok(Number.isFinite(Date.parse(body.updatedAt)))
})

test("database errors roll back, release the connection, and return a generic error", async () => {
  const api = setup({ fail: true })
  const response = await api.get()
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: "We couldn't load interviews. Please try again." })
  assert.equal(api.queries.at(-1).sql, "ROLLBACK")
  assert.equal(api.released(), 1)
})

test("unsupported row counts fail safely", async () => {
  const api = setup({ total: "9007199254740992" })
  assert.equal((await api.get()).status, 500)
  assert.equal(api.queries.at(-1).sql, "ROLLBACK")
  assert.equal(api.released(), 1)
})
