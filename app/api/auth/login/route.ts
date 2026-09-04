import { NextResponse } from "next/server"

import {
  AUTH_EMAIL,
  AUTH_PASSWORD,
  AUTH_SESSION_COOKIE_NAME,
  AUTH_SESSION_COOKIE_VALUE,
  AUTH_SESSION_MAX_AGE_SECONDS,
  AUTH_USER,
} from "@/lib/auth"

type LoginBody = {
  email?: string
  password?: string
}

export async function POST(request: Request) {
  let payload: LoginBody

  try {
    payload = (await request.json()) as LoginBody
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const email = payload?.email?.trim()
  const password = payload?.password

  if (email !== AUTH_EMAIL || password !== AUTH_PASSWORD) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  }

  const response = NextResponse.json({ success: true, user: AUTH_USER })
  response.cookies.set({
    name: AUTH_SESSION_COOKIE_NAME,
    value: AUTH_SESSION_COOKIE_VALUE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  })

  return response
}
