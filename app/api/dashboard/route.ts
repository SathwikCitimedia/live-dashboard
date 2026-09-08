import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import type { DashboardData, KeyUsageRow } from "@/lib/dashboard-types"
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
    const sqlOne = process.env.DB_QUERY_1
    const sqlTwo = process.env.DB_QUERY_2
    if (!sqlOne?.trim() || !sqlTwo?.trim()) throw new Error("Usage queries are not configured")

    client = await pool.connect()
    // One snapshot keeps the total and all per-key counts consistent.
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const total = await client.query<{ total_requests: string }>(`
      SELECT total_requests::text FROM (${normalizeSql(sqlOne)}) AS summary
      WHERE environment_and_key = 'TOTAL (all keys)'
    `)
    if (total.rows.length !== 1 || !/^\d+$/.test(total.rows[0].total_requests)) {
      throw new Error("Usage summary must contain one valid total row")
    }
    const result = await client.query<KeyUsageRow>(`
      SELECT environment_and_key, total_requests::text AS total_requests
      FROM (${normalizeSql(sqlTwo)}) AS usage
      ORDER BY usage.total_requests::numeric DESC, environment_and_key ASC
    `)
    await client.query("COMMIT")
    return json({
      totalRequests: total.rows[0].total_requests,
      rows: result.rows,
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
