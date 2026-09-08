import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import pool from "@/lib/db"
import type { InterviewRow, InterviewsApiResponse } from "@/lib/interview-types"

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
    client = await pool.connect()
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const count = await client.query<{ total: string }>("SELECT COUNT(*)::text AS total FROM interviews")
    const totalRows = Number(count.rows[0].total)
    if (!Number.isSafeInteger(totalRows) || totalRows < 0) throw new Error("Interview count exceeds supported range")
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    const page = Math.min(requestedPage, totalPages)

    // Explicit projection keeps security_hash and security_token out of the response.
    // Cast timezone-less timestamps to text before pg can interpret them in the server timezone.
    const result = await client.query<InterviewRow>(`
      SELECT id, interview_id, candidate_id, candidate_name, candidate_email, candidate_phones,
        role, status, interview_time, recruiter_name, recruiter_phone, hr_user_id, hr_phone,
        source, timezone, created_at, started_at, completed_at, updated_at,
        last_heartbeat_at::text AS last_heartbeat_at,
        last_socket_disconnect_at::text AS last_socket_disconnect_at,
        abandoned_at::text AS abandoned_at,
        presence_status, current_socket_id, disconnect_reason, reconnect_count,
        digital_human_enabled, is_demo, challenges, widget_id, interview_link, stream_response_config
      FROM interviews
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT $1 OFFSET $2
    `, [pageSize, (page - 1) * pageSize])
    await client.query("COMMIT")
    return json({
      rows: result.rows,
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
