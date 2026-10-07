import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

function load(path, imports, globals = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const loadedModule = { exports: {} }
  const names = Object.keys(globals)
  runInThisContext(`(function(require, module, exports, ${names.join(",")}) { ${compiled}\n})`)(
    (name) => imports[name] ?? require(name), loadedModule, loadedModule.exports, ...Object.values(globals),
  )
  return loadedModule.exports
}

const snapshot = (count, page = 1, pageSize = 10) => ({
  summary: { api_consumption_all: count, distinct_interviews: "290", first_used: "2026-06-22 08:43:20.166232", last_used: "2026-09-25 13:18:22.600585" },
  rows: [{ id: page, interview_id: `interview-${page}`, candidate_name: null, candidate_email: null, role: null, status: null, session_id: null, api_consumption: count, first_used: null, last_used: null }],
  pagination: { page, pageSize, totalRows: 290, totalPages: Math.ceil(290 / pageSize) },
  updatedAt: `2026-10-07T08:00:${page.toString().padStart(2, "0")}Z`,
})

// A small hook host exercises request lifecycles without requiring a browser or a database.
function setup() {
  const slots = []
  const effects = []
  const requests = []
  const redirects = []
  const deliveredSnapshots = []
  let cursor = 0
  let current
  const router = { replace(url) { redirects.push(url) } }
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial }
      return [slots[index].value, (value) => {
        slots[index].value = typeof value === "function" ? value(slots[index].value) : value
        if (index === 0 && slots[index].value) deliveredSnapshots.push(slots[index].value)
      }]
    },
    useRef(initial) {
      const index = cursor++
      if (!slots[index]) slots[index] = { current: initial }
      return slots[index]
    },
    useCallback(callback, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { callback, deps }
      return slots[index].callback
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        slots[index] = { deps }
        effects.push(effect)
      }
    },
  }
  const { useInterviews } = load("../hooks/use-interviews.ts", {
    react: hooks,
    "next/navigation": { useRouter: () => router },
  }, {
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  })
  const render = function HookHost() { cursor = 0; current = useInterviews(); return current }
  render()
  effects.splice(0).forEach(effect => effect())
  const settle = async (index, body, status = 200) => {
    requests[index].resolve({ status, ok: status >= 200 && status < 300, json: async () => body })
    // Drain the fetch, JSON, and finally continuations before rendering the resulting state.
    await new Promise(resolve => setImmediate(resolve))
    return render()
  }
  return { requests, redirects, deliveredSnapshots, render, settle, current: () => current }
}

test("loads and refreshes summary, rows, pagination and update time as one snapshot", async () => {
  const hook = setup()
  assert.equal(hook.current().data, null)
  assert.equal(hook.requests.length, 1)
  assert.equal(hook.requests[0].url, "/api/interviews?page=1&pageSize=10")
  assert.equal(hook.requests[0].options.credentials, "include")
  assert.equal(hook.requests[0].options.cache, "no-store")
  const first = snapshot("482")
  await hook.settle(0, first)
  assert.strictEqual(hook.current().data, first)
  hook.current().refresh()
  assert.strictEqual(hook.render().data, first)
  assert.equal(hook.current().isLoading, true)
  await hook.settle(1, { error: "generic failure" }, 500)
  assert.strictEqual(hook.current().data, first)
  assert.match(hook.current().error, /API consumption and interviews/)
  assert.equal(hook.current().isLoading, false)
  hook.current().retry()
  assert.strictEqual(hook.render().data, first)
  assert.equal(hook.current().error, null)
  const second = snapshot("483")
  await hook.settle(2, second)
  assert.strictEqual(hook.current().data, second)
  assert.deepEqual(hook.deliveredSnapshots, [first, second])
  assert.ok(hook.requests.every(({ url }) => url.startsWith("/api/interviews?")))
})

test("failed page changes retain the old snapshot and retry the requested page and size", async () => {
  const hook = setup()
  const first = snapshot("482")
  await hook.settle(0, first)
  hook.current().request(3, 25)
  assert.strictEqual(hook.render().data, first)
  await hook.settle(1, { error: "failure" }, 500)
  hook.current().retry()
  assert.equal(hook.requests[2].url, "/api/interviews?page=3&pageSize=25")
  const thirdPage = snapshot("490", 3, 25)
  await hook.settle(2, thirdPage)
  assert.strictEqual(hook.current().data, thirdPage)
  hook.current().refresh()
  assert.equal(hook.requests[3].url, "/api/interviews?page=3&pageSize=25")
})

test("an older response cannot replace the newer shared snapshot", async () => {
  const hook = setup()
  hook.current().request(2, 10)
  assert.equal(hook.requests[0].options.signal.aborted, true)
  const latest = snapshot("483", 2)
  await hook.settle(1, latest)
  await hook.settle(0, snapshot("482"))
  assert.strictEqual(hook.current().data, latest)
  assert.deepEqual(hook.deliveredSnapshots, [latest])
})

test("expired authentication redirects and cancellation suppresses stale errors", async () => {
  const hook = setup()
  const first = snapshot("482")
  await hook.settle(0, first)
  hook.current().refresh()
  await hook.settle(1, {}, 401)
  assert.deepEqual(hook.redirects, ["/?error=unauthorized"])
  assert.strictEqual(hook.current().data, first)
  assert.equal(hook.current().error, null)
  hook.current().refresh()
  hook.current().cancel()
  assert.equal(hook.requests[2].options.signal.aborted, true)
  await hook.settle(2, { error: "late failure" }, 500)
  assert.strictEqual(hook.current().data, first)
  assert.equal(hook.current().error, null)
})

test("dashboard passes the same snapshot to the summary and table", () => {
  const data = snapshot("482")
  const interviews = { data, isLoading: false, error: null, refresh() {}, cancel() {} }
  let summaryProps
  let tableProps
  const { default: DashboardPage } = load("../app/dashboard/page.tsx", {
    "next/navigation": { useRouter: () => ({ replace() {} }) },
    "@/hooks/use-interviews": { useInterviews: () => interviews },
    "@/components/usage-summary": { UsageSummary: props => { summaryProps = props; return null } },
    "@/components/interviews-table": { InterviewsTable: props => { tableProps = props; return null } },
    "@/components/ui/button": { Button: ({ children }) => React.createElement("button", null, children) },
    "@/components/ui/alert": {},
  })
  const markup = renderToStaticMarkup(React.createElement(DashboardPage))
  assert.match(markup, /View API consumption and the interviews behind it/)
  assert.strictEqual(summaryProps.data, tableProps.interviews.data)
  assert.strictEqual(summaryProps.data, data)
  assert.equal(summaryProps.isLoading, tableProps.interviews.isLoading)
})
