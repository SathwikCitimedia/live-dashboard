import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import { assertUsageSummaryMatchesInterviews, getUsageSummarySql, loadInterviewPage, loadUsageSummary } from "@/lib/consumption-queries"
import pool from "@/lib/db"
import type { InterviewsApiResponse } from "@/lib/interview-types"

export const runtime = "nodejs"

const json = (body: InterviewsApiResponse, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } })

export async function GET(request: NextRequest) {
  if (!isSessionValid(request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value)) {
    return json({ error: "Please sign in to view interviews." }, 401)
  }

  const pageInput = request.nextUrl.searchParams.get("page") ?? "1"
  const sizeInput = request.nextUrl.searchParams.get("pageSize") ?? "10"
  const requestedPage = Number(pageInput)
  const pageSize = Number(sizeInput)
  if (!/^[1-9]\d*$/.test(pageInput) || !Number.isSafeInteger(requestedPage) ||
      !/^(10|25|50)$/.test(sizeInput)) {
    return json({ error: "Choose a valid page and page size." }, 400)
  }

  let client
  try {
    const sql = getUsageSummarySql()
    client = await pool.connect()
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const summary = await loadUsageSummary(client, sql)
    await assertUsageSummaryMatchesInterviews(client, summary)
    const totalRows = Number(summary.distinct_interviews)
    if (!Number.isSafeInteger(totalRows) || totalRows < 0) throw new Error("Interview count exceeds supported range")
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const page = Math.min(requestedPage, totalPages)

    const offset = (page - 1) * pageSize
    const rows = await loadInterviewPage(client, pageSize, offset)
    if (rows.length !== Math.min(pageSize, totalRows - offset)) {
      throw new Error("Interview page does not match the consumption summary")
    }
    await client.query("COMMIT")
    return json({
      summary,
      rows,
      pagination: { page, pageSize, totalRows, totalPages },
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined)
    console.error("Unable to load interviews:", error)
    return json({ error: "We couldn't load interviews. Please try again." }, 500)
  } finally {
    client?.release()
  }
}
