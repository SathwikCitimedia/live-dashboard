import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import { runInThisContext } from "node:vm"
import ts from "typescript"

const require = createRequire(import.meta.url)
const source = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const routeModule = { exports: {} }
const load = (name) => name === "@/lib/auth" ? {
  AUTH_EMAIL: "test-recruiter", AUTH_PASSWORD: "test-password", AUTH_USER: "admin",
  AUTH_SESSION_COOKIE_NAME: "test-session", AUTH_SESSION_COOKIE_VALUE: "test-session-value",
  AUTH_SESSION_MAX_AGE_SECONDS: 28800,
} : require(name)
runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(load, routeModule, routeModule.exports)

const post = (body) => routeModule.exports.POST(new Request("http://localhost/api/auth/login", {
  method: "POST", headers: { "content-type": "application/json" }, body,
}))

test("accepts the form's username payload and issues the existing session cookie", async () => {
  const response = await post(JSON.stringify({ username: " test-recruiter ", password: "test-password" }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { success: true, user: "admin" })
  const cookie = response.headers.get("set-cookie")
  assert.match(cookie, /test-session=test-session-value/)
  assert.match(cookie, /HttpOnly/i)
  assert.match(cookie, /SameSite=lax/i)
  assert.match(cookie, /Max-Age=28800/i)
})

test("rejects incorrect, missing, or non-string credentials without a session cookie", async () => {
  for (const payload of [
    { username: "wrong", password: "test-password" },
    { username: "test-recruiter", password: "wrong" },
    { username: "test-recruiter", password: " test-password " },
    { username: 123, password: "test-password" },
    { username: {}, password: "test-password" },
    { username: "test-recruiter", password: ["test-password"] },
    { email: "test-recruiter", password: "test-password" },
    {}, null,
  ]) {
    const response = await post(JSON.stringify(payload))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: "Invalid credentials" })
    assert.equal(response.headers.get("set-cookie"), null)
  }
})

test("rejects malformed JSON", async () => {
  const response = await post("{")
  assert.equal(response.status, 400)
  assert.equal(response.headers.get("set-cookie"), null)
})
