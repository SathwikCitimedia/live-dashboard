import { NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME } from "@/lib/auth"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: AUTH_SESSION_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  })
  return response
}
