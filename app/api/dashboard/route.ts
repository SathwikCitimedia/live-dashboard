import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"
import pool from "@/lib/db"

type QueryPayload = {
  name: string
  sql: string
  rows: unknown[]
  rowCount: number
}

const sqlOne = process.env.DB_QUERY_1 || "SELECT NOW() AS server_time"
const sqlTwo =
  process.env.DB_QUERY_2 ||
  "SELECT current_database() AS database_name, current_user AS db_user"

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value
  if (!isSessionValid(sessionToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const [first, second] = await Promise.all([pool.query(sqlOne), pool.query(sqlTwo)])

    const payload: { queries: QueryPayload[] } = {
      queries: [
        {
          name: "query_1",
          sql: sqlOne,
          rows: first.rows,
          rowCount: first.rowCount ?? first.rows.length,
        },
        {
          name: "query_2",
          sql: sqlTwo,
          rows: second.rows,
          rowCount: second.rowCount ?? second.rows.length,
          },
      ],
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("DB query failed:", error)
    return NextResponse.json({ error: "Failed to execute SQL queries" }, { status: 500 })
  }
}
