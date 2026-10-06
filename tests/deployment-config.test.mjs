import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const deploymentScript = fileURLToPath(new URL("../CloudRun.Deploy.sh", import.meta.url))
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8")
const query = `SELECT
    CASE
        WHEN a.api_key_prefix = 'ds-9f3a7c2' THEN 'Production (original key)'
        WHEN a.api_key_prefix = 'ds-097b27f' THEN 'Production (new key)'
        WHEN a.api_key_prefix = 'ds-2671acc' THEN 'Dev/Staging (new key)'
        ELSE 'TOTAL (all keys)'
    END AS environment_and_key,
    COUNT(*) AS webhook_deliveries,
    MIN(w.created_at) AS first_used,
    MAX(w.created_at) AS last_used
FROM webhook_logs_AM w
JOIN api_usage_AM a ON a.interview_id = w.interview_id
WHERE w.success = TRUE
  AND a.api_key_prefix IN ('ds-9f3a7c2', 'ds-097b27f', 'ds-2671acc')
GROUP BY ROLLUP (a.api_key_prefix)
ORDER BY webhook_deliveries DESC;`

function runDeployment(overrides = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "webhook-deployment-test-"))
  const log = path.join(directory, "commands.jsonl")
  const stub = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
fs.appendFileSync(process.env.STUB_DEPLOY_LOG, JSON.stringify({ command: path.basename(process.argv[1]), args: process.argv.slice(2) }) + "\\n")
`
  try {
    for (const command of ["gcloud", "docker"]) {
      const filename = path.join(directory, command)
      writeFileSync(filename, stub)
      chmodSync(filename, 0o700)
    }
    const env = {
      PATH: `${directory}:${process.env.PATH}`,
      STUB_DEPLOY_LOG: log,
      GCP_PROJECT_ID: "test-project",
      VPC_CONNECTOR: "test-connector",
      IMAGE_TAG: "test-tag",
      DB_HOST: "test-db",
      DB_PORT: "5432",
      DB_NAME: "test-database",
      DB_USER: "test-user",
      DB_PASSWORD: "test=password,with punctuation",
      ADMIN_EMAIL: "test@example.com",
      ADMIN_PASSWORD: "test-admin-password",
      DB_QUERY_1: query,
      ...overrides,
    }
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete env[key]
    }
    const result = spawnSync("bash", [deploymentScript], {
      cwd: directory,
      env,
      encoding: "utf8",
      timeout: 10_000,
    })
    let commands = []
    try {
      commands = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    return { result, commands }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function deployedEnvironment(commands) {
  const deploy = commands.find(({ command, args }) => command === "gcloud" && args[0] === "run")
  assert.ok(deploy)
  const envArgs = deploy.args.filter((arg) => arg.startsWith("--set-env-vars="))
  assert.equal(envArgs.length, 1)
  const payload = envArgs[0].slice("--set-env-vars=".length)
  const prefix = payload.match(/^\^([^\^]+)\^/)
  assert.ok(prefix)
  const entries = payload.slice(prefix[0].length).split(prefix[1])
  return Object.fromEntries(entries.map((entry) => {
    const equalsIndex = entry.indexOf("=")
    assert.ok(equalsIndex > 0)
    return [entry.slice(0, equalsIndex), entry.slice(equalsIndex + 1)]
  }))
}

test("documents the exact successful webhook rollup query", () => {
  assert.ok(readme.includes(`DB_QUERY_1="${query}"`))
})

test("passes multiline SQL and comma-containing settings intact in one deployment argument", () => {
  const { result, commands } = runDeployment({ ADMIN_SESSION_TOKEN: "test-session,with=punctuation\nand a newline" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(commands.filter(({ command }) => command === "docker").length, 2)
  assert.equal(commands.filter(({ command }) => command === "gcloud").length, 3)
  const environment = deployedEnvironment(commands)
  assert.deepEqual(environment, {
    NODE_ENV: "production",
    DB_HOST: "test-db",
    DB_PORT: "5432",
    DB_NAME: "test-database",
    DB_USER: "test-user",
    DB_PASSWORD: "test=password,with punctuation",
    ADMIN_EMAIL: "test@example.com",
    ADMIN_PASSWORD: "test-admin-password",
    DB_QUERY_1: query,
    ADMIN_SESSION_TOKEN: "test-session,with=punctuation\nand a newline",
  })
})

test("deploys under set -u without a second query or optional session token", () => {
  const { result, commands } = runDeployment()
  assert.equal(result.status, 0, result.stderr)
  const environment = deployedEnvironment(commands)
  assert.equal(environment.DB_QUERY_1, query)
  assert.equal(Object.hasOwn(environment, "DB_QUERY_2"), false)
  assert.equal(Object.hasOwn(environment, "ADMIN_SESSION_TOKEN"), false)
})

test("preserves an explicitly empty optional session token", () => {
  const { result, commands } = runDeployment({ ADMIN_SESSION_TOKEN: "" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(deployedEnvironment(commands).ADMIN_SESSION_TOKEN, "")
})

test("rejects delimiter collisions before Docker or gcloud without printing values", () => {
  for (const key of ["DB_QUERY_1", "DB_PASSWORD", "ADMIN_SESSION_TOKEN"]) {
    const { result, commands } = runDeployment({ [key]: "test-sensitive-value__LIVE_DASHBOARD_ENV__suffix" })
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.equal(result.stderr, `Environment delimiter collision in ${key}\n`)
    assert.deepEqual(commands, [])
  }
})

test("rejects missing required settings before Docker or gcloud", () => {
  const { result, commands } = runDeployment({ DB_QUERY_1: undefined })
  assert.equal(result.status, 1)
  assert.equal(result.stderr, "Set DB_QUERY_1\n")
  assert.deepEqual(commands, [])
})
