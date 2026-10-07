import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import { assertUsageSummaryMatchesInterviews, getUsageSummarySql, loadUsageSummary } from "@/lib/consumption-queries"
import type { DashboardData } from "@/lib/dashboard-types"
import pool from "@/lib/db"

export const runtime = "nodejs"

const json = (body: DashboardData | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

export async function GET(request: NextRequest) {
  if (!isSessionValid(request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value)) {
    return json({ error: "Please sign in to view your usage." }, 401)
  }

  let client
  try {
    const sql = getUsageSummarySql()

    client = await pool.connect()
    // Validate the configured summary against the same raw-log snapshot.
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const summary = await loadUsageSummary(client, sql)
    await assertUsageSummaryMatchesInterviews(client, summary)
    await client.query("COMMIT")
    return json({
      summary,
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
