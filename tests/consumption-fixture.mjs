import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const { NextRequest } = require("next/server")
const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const helperSource = compile("../lib/consumption-queries.ts")
const routeSources = {
  interviews: compile("../app/api/interviews/route.ts"),
  dashboard: compile("../app/api/dashboard/route.ts"),
}

export const SUMMARY_QUERY = `SELECT COUNT(*) AS api_consumption_all,
  COUNT(DISTINCT interview_id) AS distinct_interviews,
  MIN(created_at) AS first_used, MAX(created_at) AS last_used
FROM webhook_logs_am;`

export const interview = (id, overrides = {}) => ({
  id, interview_id: `am-${id}`, candidate_name: `Candidate ${id}`,
  candidate_email: `candidate-${id}@example.test`, role: "Engineer", status: "completed", session_id: null,
  ...overrides,
})
export const log = (interview_id, created_at, overrides = {}) => ({ interview_id, created_at, success: true, ...overrides })
export const smallFixture = () => ({
  interviews: [interview(1), interview(2, { status: "in_progress" }), interview(3)],
  logs: [
    log("am-1", "2026-10-01 01:15:10.123456+00"),
    log("am-1", "2026-10-06 09:30:00.654321+00", { success: false }),
    log("am-2", "2026-10-05 12:00:00+00"),
  ],
})

function extrema(values) {
  const dates = values.filter((value) => value !== null).sort()
  return [dates[0] ?? null, dates.at(-1) ?? null]
}

export function summarize(fixture) {
  const [first_used, last_used] = extrema(fixture.logs.map((entry) => entry.created_at))
  return {
    api_consumption_all: String(fixture.logs.length),
    distinct_interviews: String(new Set(fixture.logs.map((entry) => entry.interview_id).filter((id) => id !== null)).size),
    first_used, last_used,
  }
}

function groups(fixture) {
  const result = new Map()
  for (const entry of fixture.logs) {
    const entries = result.get(entry.interview_id) ?? []
    entries.push(entry)
    result.set(entry.interview_id, entries)
  }
  return result
}

function reconcile(fixture) {
  let invalid = 0
  for (const id of groups(fixture).keys()) {
    if (id === null || fixture.interviews.filter((row) => row.interview_id === id).length !== 1) invalid++
  }
  return { ...summarize(fixture), invalid_interviews: String(invalid) }
}

function eligibleRows(fixture) {
  const grouped = groups(fixture)
  return fixture.interviews.filter((row) => row.interview_id !== null && grouped.has(row.interview_id)).map((row) => {
    const entries = grouped.get(row.interview_id)
    const [first_used, last_used] = extrema(entries.map((entry) => entry.created_at))
    return {
      id: row.id, interview_id: row.interview_id, candidate_name: row.candidate_name,
      candidate_email: row.candidate_email, role: row.role, status: row.status, session_id: row.session_id,
      api_consumption: String(entries.length), first_used, last_used,
    }
  }).sort((a, b) => {
    if (a.last_used === null && b.last_used !== null) return 1
    if (b.last_used === null && a.last_used !== null) return -1
    return (b.last_used ?? "").localeCompare(a.last_used ?? "") || b.id - a.id
  })
}

export function setupRoute(route, options = {}) {
  const fixture = options.fixture ?? smallFixture()
  const queries = []
  let connected = 0
  let released = 0
  let snapshot = fixture
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      const stage = sql.includes("AS usage_summary") ? "summary"
        : sql.includes("AS reconciliation") ? "reconciliation"
        : sql.includes("LIMIT $1 OFFSET $2") ? "page" : sql
      if (stage === options.failAt || (sql === "ROLLBACK" && options.failRollback)) {
        throw new Error("Private database details")
      }
      if (sql === "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY") {
        snapshot = structuredClone(fixture)
      }
      let rows = []
      if (stage === "summary") rows = options.summaryRows ?? [summarize(snapshot)]
      if (stage === "reconciliation") rows = options.reconciliationRows ?? [reconcile(snapshot)]
      if (stage === "page") rows = options.pageRows ?? eligibleRows(snapshot).slice(params[1], params[1] + params[0])
      options.afterQuery?.(stage, fixture)
      return { rows }
    },
    release() { released++ },
  }
  const environment = { env: options.configured === false ? {} : { DB_QUERY_1: options.query ?? SUMMARY_QUERY } }
  const helperModule = { exports: {} }
  runInThisContext(`(function(require, module, exports, process) { ${helperSource}\n})`)(
    require, helperModule, helperModule.exports, environment,
  )
  const routeModule = { exports: {} }
  const load = (name) => {
    if (name === "@/lib/consumption-queries") return helperModule.exports
    if (name === "@/lib/db") return { default: { async connect() {
      connected++
      if (options.connectFail) throw new Error("Private connection details")
      return client
    } } }
    if (name === "@/lib/auth") return { AUTH_SESSION_COOKIE_NAME: "session", isSessionValid: (value) => value === "valid" }
    return require(name)
  }
  runInThisContext(`(function(require, module, exports, console) { ${routeSources[route]}\n})`)(
    load, routeModule, routeModule.exports, { error() {} },
  )
  return {
    queries, connected: () => connected, released: () => released,
    get: (query = "", authorized = true) => routeModule.exports.GET(new NextRequest(`http://localhost/api/${route}${query}`, {
      headers: authorized ? { cookie: "session=valid" } : {},
    })),
  }
}
