import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import type { DashboardData, WebhookUsageRow } from "@/lib/dashboard-types"
import pool from "@/lib/db"

export const runtime = "nodejs"

const normalizeSql = (sql: string) => sql.trim().replace(/;+\s*$/, "")
const json = (body: DashboardData | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

export async function GET(request: NextRequest) {
  if (!isSessionValid(request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value)) {
    return json({ error: "Please sign in to view your usage." }, 401)
  }

  let client
  try {
    const sql = process.env.DB_QUERY_1
    if (!sql?.trim()) throw new Error("Usage query is not configured")

    client = await pool.connect()
    // One snapshot keeps the total and all per-key counts consistent.
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const result = await client.query<WebhookUsageRow>(`
      SELECT environment_and_key,
        webhook_deliveries::text AS webhook_deliveries,
        first_used::text AS first_used,
        last_used::text AS last_used
      FROM (${normalizeSql(sql)}) AS usage
      ORDER BY usage.webhook_deliveries::numeric DESC, environment_and_key ASC
    `)
    const totals = result.rows.filter((row) => row.environment_and_key === "TOTAL (all keys)")
    if (totals.length !== 1) {
      throw new Error("Usage summary must contain one valid total row")
    }
    if (result.rows.some((row) => typeof row.webhook_deliveries !== "string" || !/^\d+$/.test(row.webhook_deliveries))) {
      throw new Error("Usage summary must contain valid delivery counts")
    }
    await client.query("COMMIT")
    return json({
      total: totals[0],
      rows: result.rows.filter((row) => row.environment_and_key !== "TOTAL (all keys)"),
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined)
    console.error("Unable to load usage:", error)
    return json({ error: "We couldn't load your usage. Please try again." }, 500)
  } finally {
    client?.release()
  }
}
