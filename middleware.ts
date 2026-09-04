import { NextRequest, NextResponse } from "next/server"

import { AUTH_SESSION_COOKIE_NAME, isSessionValid } from "@/lib/auth"

export function middleware(request: NextRequest) {
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value

  if (!isSessionValid(sessionToken)) {
    if (request.nextUrl.pathname.startsWith("/api/dashboard")) {
      return NextResponse.json(
        { error: "Unauthorized", details: "Missing or invalid session cookie" },
        { status: 401 }
      )
    }

    const loginRedirect = request.nextUrl.clone()
    loginRedirect.pathname = "/"
    loginRedirect.searchParams.set("error", "unauthorized")
    return NextResponse.redirect(loginRedirect)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/dashboard"],
}
