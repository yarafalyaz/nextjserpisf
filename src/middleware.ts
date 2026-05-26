import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// Fix #24: Only allow actual static file extensions, not any URL with a dot
const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot|map)$/i

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow Next.js internals
  if (pathname.startsWith("/_next")) {
    return NextResponse.next()
  }

  // Allow actual static files (specific extensions only)
  if (STATIC_EXTENSIONS.test(pathname)) {
    return NextResponse.next()
  }

  // Fix #25: API routes still need to pass through (they handle their own auth),
  // but we validate auth for sensitive API paths
  if (pathname.startsWith("/api")) {
    // Cron routes use their own CRON_SECRET verification
    if (pathname.startsWith("/api/cron")) {
      return NextResponse.next()
    }

    // All other API routes: check auth at middleware level
    const token = await getToken({ req, secret: process.env.AUTH_SECRET })
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  const isLoggedIn = !!token
  const isAuthPage = pathname.startsWith("/login")

  // Redirect logged-in users away from login page
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Redirect non-logged-in users to login
  if (!isAuthPage && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
