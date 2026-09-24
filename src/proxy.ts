import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { takeRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { isSecureRequest } from "@/lib/security/secure-request";

// Fix #24: Only allow actual static file extensions, not any URL with a dot
const STATIC_EXTENSIONS =
  /\.(ico|png|jpg|jpeg|gif|svg|webp|css|js|woff2?|ttf|eot|map)$/i;

// Rate limit configs per route category
const RATE_LIMITS = {
  upload: { windowMs: 60_000, max: 20 }, // 20 uploads/min
  api: { windowMs: 60_000, max: 120 }, // 120 API calls/min
  auth: { windowMs: 300_000, max: 10 }, // 10 login attempts/5min
} as const;

function addSecurityHeaders(req: NextRequest, response: NextResponse): NextResponse {
  // CSP keeps 'unsafe-inline' for scripts because Next.js emits inline
  // bootstrap <script> tags that are NOT nonce-tagged unless the nonce is
  // plumbed through `NextResponse.next({ request: { headers }})` AND verified
  // against a production build. A misconfigured nonce/strict-dynamic policy
  // silently blocks hydration (login form never submits). 'unsafe-eval' is
  // dropped in production. Tighten to nonce-based CSP only after verifying a
  // prod build end-to-end (login + hydration).
  const isProd = process.env.NODE_ENV === "production";
  // `upgrade-insecure-requests` (and HSTS) may only be sent over TLS. Emitting
  // them on a plain-HTTP production build - the e2e/CI server on
  // http://localhost:4101, or an on-prem install without a certificate - makes
  // the browser rewrite same-origin navigations to https://localhost:4101 and
  // every page load after login dies with ERR_SSL_PROTOCOL_ERROR.
  const isHttps = isSecureRequest(req);
  const scriptSrc = isProd
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    isProd ? "connect-src 'self' https:" : "connect-src 'self' https: ws:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProd && isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)",
  );
  if (isHttps) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals
  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Allow actual static files (specific extensions only)
  if (STATIC_EXTENSIONS.test(pathname)) {
    return NextResponse.next();
  }

  const ip = getClientIp(req);

  // Rate limit login attempts
  if (pathname === "/login" && req.method === "POST") {
    const result = await takeRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
    if (!result.allowed) {
      return addSecurityHeaders(req, 
        NextResponse.json(
          { error: "Too many attempts, coba lagi nanti" },
          { status: 429 },
        ),
      );
    }
  }

  // Fix #25: API routes still need to pass through (they handle their own auth),
  // but we validate auth for sensitive API paths
  if (pathname.startsWith("/api")) {
    // NextAuth must stay reachable before a user has a session.
    if (pathname.startsWith("/api/auth")) {
      if (req.method === "POST") {
        const result = await takeRateLimit(`auth:${ip}`, RATE_LIMITS.auth);
        if (!result.allowed) {
          return addSecurityHeaders(req, 
            NextResponse.json(
              { error: "Too many attempts, coba lagi nanti" },
              { status: 429 },
            ),
          );
        }
      }
      return addSecurityHeaders(req, NextResponse.next());
    }

    // Cron routes use their own CRON_SECRET verification
    if (pathname.startsWith("/api/cron")) {
      return addSecurityHeaders(req, NextResponse.next());
    }

    // Health check must be reachable without a session — it's the liveness
    // probe for monitors / load balancers / k8s / CI. It exposes no sensitive
    // data (DB SELECT 1 + status) and returns 200/503 by design.
    if (pathname === "/api/health") {
      return addSecurityHeaders(req, NextResponse.next());
    }

    // Rate limit upload endpoints more strictly
    if (pathname.startsWith("/api/upload")) {
      const result = await takeRateLimit(`upload:${ip}`, RATE_LIMITS.upload);
      if (!result.allowed) {
        return addSecurityHeaders(req, 
          NextResponse.json(
            { error: "Upload rate limit exceeded" },
            { status: 429 },
          ),
        );
      }
    } else {
      // General API rate limit
      const result = await takeRateLimit(`api:${ip}`, RATE_LIMITS.api);
      if (!result.allowed) {
        return addSecurityHeaders(req, 
          NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
        );
      }
    }

    // All other API routes: check auth at proxy level
    // Fix C1: also enforce isActive — deactivated users must be blocked here so
    // they cannot use a still-valid JWT to hit routes that only call auth().
    //
    // `secureCookie` must follow the REQUEST SCHEME, exactly like Auth.js does
    // when it decides between `authjs.session-token` and
    // `__Secure-authjs.session-token`. Deriving it from NODE_ENV instead meant a
    // production build served over plain HTTP (the e2e/CI server, or an on-prem
    // install without TLS) wrote non-prefixed cookies while this code looked for
    // the `__Secure-` ones: getToken always returned null, every page bounced
    // back to /login and the app was unusable behind a login loop.
    const secureCookie = isSecureRequest(req);
    const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
    if (!token || (token as { isActive?: boolean }).isActive === false) {
      return addSecurityHeaders(req, 
        NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 }),
      );
    }
    return addSecurityHeaders(req, NextResponse.next());
  }

  // Same request-scheme rule as above: NODE_ENV does not tell us whether Auth.js
  // prefixed the session cookie with `__Secure-`.
  const secureCookie = isSecureRequest(req);
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });
  // Treat a deactivated user as not-logged-in for page routing. Otherwise the
  // dashboard layout redirects them to /login (deactivated), but the "logged-in
  // -> away from /login" rule below would bounce them back to / -> infinite loop.
  const isLoggedIn =
    !!token && (token as { isActive?: boolean }).isActive !== false;
  const isAuthPage = pathname.startsWith("/login");
  const isPublicPage =
    isAuthPage ||
    pathname === "/ketentuan-layanan" ||
    pathname === "/kebijakan-privasi";

  // A deactivated (or password-changed) user can still carry a stale-but-valid
  // JWT cookie: the dashboard layout re-syncs against the DB via auth() and
  // redirects to /login?reason=deactivated, but the raw JWT this middleware
  // decodes here may still report isActive=true (re-sync only runs inside the
  // jwt callback, not in getToken). Bouncing such a "logged-in" user back to /
  // creates an infinite redirect loop (ERR_TOO_MANY_REDIRECTS). When /login
  // carries an explicit reason, clear the stale session cookie and render login
  // instead of redirecting away.
  const reason = req.nextUrl.searchParams.get("reason");
  if (isAuthPage && isLoggedIn && reason) {
    const res = addSecurityHeaders(req, NextResponse.next());
    res.cookies.delete("authjs.session-token");
    res.cookies.delete("__Secure-authjs.session-token");
    return res;
  }

  // Redirect logged-in users away from login page
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect non-logged-in users to login
  if (!isPublicPage && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Sensitive route protection — super_admin only
  if (isLoggedIn) {
    const userRoles = (token?.roles as string[] | undefined) ?? [];
    const isSuperAdmin = userRoles.includes("super_admin");
    const sensitiveRoutes = [
      "/pengaturan/peran",
      "/pengaturan/pengguna",
      "/pengaturan/database",
      "/pengaturan/system",
      "/pengaturan/log-aktivitas",
    ];
    for (const pattern of sensitiveRoutes) {
      if (pathname.startsWith(pattern) && !isSuperAdmin) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }
  }

  return addSecurityHeaders(req, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
