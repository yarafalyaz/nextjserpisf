import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { takeRateLimit, getClientIp } from "@/lib/security/rate-limit"

// Next.js proxy always runs on the Node.js runtime by default (unlike
// middleware in older Next.js versions), so the in-memory rate-limiter
// Map is preserved across requests. For true multi-region production,
// swap takeRateLimit for Upstash/Redis — the function signature stays
// identical.

// Fix #24: Only allow actual static file extensions, not any URL with a dot
const STATIC_EXTENSIONS = /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot|map)$/i

// Rate limit configs per route category
const RATE_LIMITS = {
  upload: { windowMs: 60_000, max: 20 },   // 20 uploads/min
  api: { windowMs: 60_000, max: 120 },      // 120 API calls/min
  auth: { windowMs: 300_000, max: 10 },     // 10 login attempts/5min
} as const

function addSecurityHeaders(req: NextRequest, response: NextResponse): NextResponse {
  // Generate per-request nonce. Next.js auto-injects it on <script> tags it emits
  // when it sees the matching CSP header on the request, so we can drop
  // 'unsafe-inline' from script-src in production.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDev = process.env.NODE_ENV === "development"

  const csp = isDev
    ? [
        // Dev: keep unsafe-inline + unsafe-eval so Next.js HMR / devtools work.
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: ws:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    : [
        // Prod: nonce + strict-dynamic blocks 'unsafe-inline' for scripts.
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        // style-src keeps 'unsafe-inline' (Tailwind / Next.js style streaming).
        // Tighten further by adopting a CSS-in-JS nonce flow.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
      ].join("; ")

  const cspHeader = csp.replace(/\s{2,}/g, " ").trim()

  // Headers that are static and also set in next.config.ts — kept here for
  // defense-in-depth so any path that bypasses the static matcher still gets them.
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "SAMEORIGIN")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
  response.headers.set("Content-Security-Policy", cspHeader)

  // Expose nonce so server components / route handlers can read it via headers().
  response.headers.set("x-nonce", nonce)
  // Make nonce available to the downstream render via the request headers Next.js sees.
  // We mutate a copy on req so getToken / server components can still read it.
  try {
    req.headers.set("x-nonce", nonce)
  } catch {
    // headers may be read-only on some runtimes; the response header still works
  }

  return response
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow Next.js internals
  if (pathname.startsWith("/_next")) {
    return NextResponse.next()
  }

  // Allow actual static files (specific extensions only)
  if (STATIC_EXTENSIONS.test(pathname)) {
    return NextResponse.next()
  }

  const ip = getClientIp(req)

  // Rate limit login attempts
  if (pathname === "/login" && req.method === "POST") {
    const result = await takeRateLimit(`auth:${ip}`, RATE_LIMITS.auth)
    if (!result.allowed) {
      return addSecurityHeaders(
        req,
        NextResponse.json({ error: "Too many attempts, coba lagi nanti" }, { status: 429 })
      )
    }
  }

  // Fix #25: API routes still need to pass through (they handle their own auth),
  // but we validate auth for sensitive API paths
  if (pathname.startsWith("/api")) {
    // NextAuth must stay reachable before a user has a session.
    if (pathname.startsWith("/api/auth")) {
      if (req.method === "POST") {
        const result = await takeRateLimit(`auth:${ip}`, RATE_LIMITS.auth)
        if (!result.allowed) {
          return addSecurityHeaders(
            req,
            NextResponse.json({ error: "Too many attempts, coba lagi nanti" }, { status: 429 })
          )
        }
      }
      return addSecurityHeaders(req, NextResponse.next())
    }

    // Cron routes use their own CRON_SECRET verification
    if (pathname.startsWith("/api/cron")) {
      return addSecurityHeaders(req, NextResponse.next())
    }

    // Health check must be reachable without a session
    if (pathname === "/api/health") {
      return addSecurityHeaders(req, NextResponse.next())
    }

    // Rate limit upload endpoints more strictly
    if (pathname.startsWith("/api/upload")) {
      const result = await takeRateLimit(`upload:${ip}`, RATE_LIMITS.upload)
      if (!result.allowed) {
        return addSecurityHeaders(
          req,
          NextResponse.json({ error: "Upload rate limit exceeded" }, { status: 429 })
        )
      }
    } else {
      // General API rate limit
      const result = await takeRateLimit(`api:${ip}`, RATE_LIMITS.api)
      if (!result.allowed) {
        return addSecurityHeaders(
          req,
          NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
        )
      }
    }

    // All other API routes: check auth at proxy level
    const token = await getToken({ req, secret: process.env.AUTH_SECRET })
    if (!token || (token as { isActive?: boolean }).isActive === false) {
      return addSecurityHeaders(
        req,
        NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
      )
    }
    return addSecurityHeaders(req, NextResponse.next())
  }

  const token = await getToken({ req, secret: process.env.AUTH_SECRET })
  const isLoggedIn = !!token
  const isAuthPage = pathname.startsWith("/login")
  const isPublicPage =
    isAuthPage ||
    pathname === "/ketentuan-layanan" ||
    pathname === "/kebijakan-privasi"

  // Redirect logged-in users away from login page
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url))
  }

  // Redirect non-logged-in users to login
  if (!isPublicPage && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Sensitive route protection — super_admin only
  if (isLoggedIn) {
    const userRoles = (token?.roles as string[] | undefined) ?? []
    const isSuperAdmin = userRoles.includes("super_admin")
    const sensitiveRoutes = [
      "/master/roles",
      "/master/users",
      "/pengaturan/database",
      "/pengaturan/system",
      "/pengaturan/audit-log",
    ]
    for (const pattern of sensitiveRoutes) {
      if (pathname.startsWith(pattern) && !isSuperAdmin) {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }
  }

  return addSecurityHeaders(req, NextResponse.next())
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
