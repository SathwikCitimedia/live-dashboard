import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test, { after } from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const originalTimezone = process.env.TZ
process.env.TZ = "Asia/Kolkata"
after(() => {
  if (originalTimezone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimezone
})

function loadComponent(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const componentModule = { exports: {} }
  runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(
    (name) => imports[name] ?? require(name), componentModule, componentModule.exports,
  )
  return componentModule.exports
}

const activityDate = loadComponent("../components/activity-date.tsx")
const { DeliveryDate } = loadComponent("../components/delivery-date.tsx", {
  "@/components/activity-date": activityDate,
})
const render = (value) => renderToStaticMarkup(React.createElement(DeliveryDate, { value }))

test("renders PostgreSQL timezone-aware dates in the viewer's timezone", () => {
  for (const suffix of ["Z", "+00", "+0000", "+00:00"]) {
    const markup = render(`2026-10-06 01:15:10.123456${suffix}`)
    assert.match(markup, /dateTime="2026-10-06T01:15:10\.123Z"/)
    assert.match(markup, /06 Oct 2026/)
    assert.match(markup, /6:45 AM/)
    assert.doesNotMatch(markup, /As recorded|Unavailable/)
  }
})

test("preserves the instant for explicit offsets and date boundary crossings", () => {
  for (const suffix of ["+0530", "+05:30"]) {
    const markup = render(`2026-10-06T09:00:00${suffix}`)
    assert.match(markup, /dateTime="2026-10-06T03:30:00\.000Z"/)
    assert.match(markup, /06 Oct 2026/)
    assert.match(markup, /9:00 AM/)
  }
  const markup = render("2026-10-06 22:45:00-04")
  assert.match(markup, /dateTime="2026-10-07T02:45:00\.000Z"/)
  assert.match(markup, /07 Oct 2026/)
  assert.match(markup, /8:15 AM/)
})

test("displays timezone-less timestamps exactly as recorded without conversion", () => {
  for (const value of ["2026-10-06 01:15:10.123456", "2024-02-29T22:45:00", "2000-02-29 00:00:00.1"]) {
    const markup = render(value)
    assert.ok(markup.includes(value))
    assert.match(markup, /As recorded · no timezone/)
    assert.match(markup, /overflow-wrap:anywhere/)
    assert.doesNotMatch(markup, /<time|dateTime=|Unavailable/)
  }
})

test("accepts valid leap dates with explicit offsets", () => {
  const markup = render("2024-02-29 23:00:00+00")
  assert.match(markup, /dateTime="2024-02-29T23:00:00\.000Z"/)
  assert.match(markup, /01 Mar 2024/)
  assert.match(markup, /4:30 AM/)
})

test("nulls, garbage, invalid calendar dates and invalid clock values are unavailable", () => {
  for (const value of [
    null, "", "not a date", "2026-10-06", "2026-02-29 12:00:00", "1900-02-29 12:00:00Z",
    "2026-04-31 12:00:00+00", "2026-00-10 12:00:00", "2026-13-10 12:00:00", "2026-10-00 12:00:00",
    "2026-10-06 24:00:00", "2026-10-06 12:60:00+00", "2026-10-06 12:00:60+00",
    "2026-10-06 12:00:00+24", "2026-10-06 12:00:00+05:60", "2026-10-06 12:00:00 UTC",
  ]) {
    assert.equal(render(value), '<span class="text-muted-foreground">Unavailable</span>', String(value))
  }
})
