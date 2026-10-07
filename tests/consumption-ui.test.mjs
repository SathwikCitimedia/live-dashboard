import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

function components({ expanded = false } = {}) {
  const cache = new Map()
  const load = (relative) => {
    const url = new URL(`../${relative}`, import.meta.url)
    if (cache.has(url.href)) return cache.get(url.href)
    const compiled = ts.transpileModule(readFileSync(url, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const componentModule = { exports: {} }
    runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)((name) => {
      if (name === "react" && relative === "components/interviews-table.tsx" && expanded) {
        return { ...React, useState: () => [new Set([1]), () => {}] }
      }
      if (name.startsWith("@/")) {
        const base = name.slice(2)
        const extension = existsSync(new URL(`../${base}.tsx`, import.meta.url)) ? ".tsx" : ".ts"
        return load(base + extension)
      }
      return require(name)
    }, componentModule, componentModule.exports)
    cache.set(url.href, componentModule.exports)
    return componentModule.exports
  }
  return { ...load("components/usage-summary.tsx"), ...load("components/interviews-table.tsx") }
}

const data = {
  summary: { api_consumption_all: "900719925474099312345", distinct_interviews: "290", first_used: "2026-06-22 08:43:20.166232", last_used: "2026-09-25 13:18:22.600585" },
  rows: [{ id: 1, interview_id: "am-interview-1", candidate_name: "Sample candidate", candidate_email: "sample@example.test", role: "Engineer", status: "completed", session_id: "am-session-1", api_consumption: "900719925474099312345", first_used: "2026-06-22 08:43:20.166232", last_used: "2026-09-25 13:18:22.600585" }],
  pagination: { page: 1, pageSize: 10, totalRows: 290, totalPages: 29 },
  updatedAt: "2026-10-07T08:00:00Z",
}
const renderSummary = (value, isLoading = false) => {
  const { UsageSummary } = components()
  return renderToStaticMarkup(React.createElement(UsageSummary, { data: value, isLoading }))
}
const renderTable = (value, options = {}) => {
  const { InterviewsTable } = components(options)
  return renderToStaticMarkup(React.createElement(InterviewsTable, {
    interviews: { data: value, isLoading: false, error: null, request() {}, retry() {}, ...options },
  }))
}

test("summary and interview rows format large counts exactly and preserve recorded timestamps", () => {
  for (const markup of [renderSummary(data), renderTable(data)]) {
    assert.match(markup, /900,719,925,474,099,312,345/)
    assert.match(markup, /2026-06-22 08:43:20\.166232/)
    assert.match(markup, /2026-09-25 13:18:22\.600585/)
    assert.match(markup, /As recorded · no timezone/)
    assert.doesNotMatch(markup, /Production|successful webhook|Scheduled time|Recruiter/)
  }
  assert.match(renderSummary(data), /Distinct interviews/)
  assert.match(renderTable(data), /Showing 1–10 of 290/)
})

test("zero consumption shows null dates as unavailable and an empty related-interview table", () => {
  const empty = { ...data, summary: { api_consumption_all: "0", distinct_interviews: "0", first_used: null, last_used: null }, rows: [], pagination: { page: 1, pageSize: 10, totalRows: 0, totalPages: 1 } }
  const summary = renderSummary(empty)
  assert.match(summary, /No API usage yet/)
  assert.equal((summary.match(/>Unavailable<\/span>/g) ?? []).length, 2)
  const table = renderTable(empty)
  assert.match(table, /No interviews yet/)
  assert.match(table, /Showing 0 of 0/)
})

test("loading includes placeholders for all four summary metrics and all eight table columns", () => {
  const summary = renderSummary(null, true)
  for (const label of ["Total API consumption", "Distinct interviews", "First used", "Last used"]) assert.ok(summary.includes(label))
  assert.equal((summary.match(/data-slot="skeleton"/g) ?? []).length, 6)
  const table = renderTable(null, { isLoading: true })
  assert.equal((table.match(/data-slot="skeleton"/g) ?? []).length, 24)
})

test("expanded details show only AM record and session identifiers", () => {
  const markup = renderTable(data, { expanded: true })
  assert.match(markup, /Record ID/)
  assert.match(markup, /Session ID/)
  assert.match(markup, /am-session-1/)
  assert.match(markup, /aria-expanded="true"/)
  assert.doesNotMatch(markup, /Presence|Configuration|Recruiter|Candidate phones/)
})

test("a failed refresh keeps existing row counts and explains that the entire snapshot is retained", () => {
  const markup = renderTable(data, { error: "Please try again." })
  assert.match(markup, /Dashboard could not be updated/)
  assert.match(markup, /last loaded summary and interviews are still shown/)
  assert.match(markup, /900,719,925,474,099,312,345/)
})
