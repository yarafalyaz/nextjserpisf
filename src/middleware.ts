import { auth } from "@/lib/auth/auth"
import { NextResponse } from "next/server"

/**
 * Route-level protection middleware.
 * - All /dashboard routes require authentication
 * - Sensitive admin routes require super_admin or specific roles
 */
export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Public routes — no auth needed
  const publicRoutes = ["/login", "/api/auth", "/api/health"]
  if (publicRoutes.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // Not authenticated → redirect to login
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Sensitive admin routes — require super_admin or specific roles
  const userRoles = session.user.roles ?? []
  const isSuperAdmin = userRoles.includes("super_admin")

  // Route → required role mapping for sensitive areas
  const sensitiveRoutes: { pattern: string; requiredRole: string }[] = [
    { pattern: "/master/roles", requiredRole: "super_admin" },
    { pattern: "/master/users", requiredRole: "super_admin" },
    { pattern: "/pengaturan/database", requiredRole: "super_admin" },
    { pattern: "/pengaturan/system", requiredRole: "super_admin" },
    { pattern: "/pengaturan/audit-log", requiredRole: "super_admin" },
  ]

  for (const route of sensitiveRoutes) {
    if (pathname.startsWith(route.pattern)) {
      if (!isSuperAdmin && !userRoles.includes(route.requiredRole)) {
        return NextResponse.redirect(new URL("/", req.url))
      }
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
