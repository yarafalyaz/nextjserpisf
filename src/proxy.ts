import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { takeRateLimit, getClientIp, canBlockOnClientIp, clientRateLimitKey } from "@/lib/security/rate-limit";
import { isSecureRequest } from "@/lib/security/secure-request";
import { SENSITIVE_ROUTE_PERMISSIONS } from "@/lib/auth/sensitive-routes";
import { isSameOriginRequest } from "@/lib/security/same-origin";

// Cookie sesi Auth.js dipecah saat tokennya panjang (`…session-token.0`, `.1`, …),
// jadi pembersihan harus mencakup semua potongan, bukan hanya nama dasarnya.
const SESSION_COOKIE_PATTERN = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

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

  // Saat identitas klien tidak tepercaya (TRUSTED_PROXY belum diset), semua
  // klien berbagi satu bucket. Kalau bucket bersama itu dipakai untuk
  // memblokir, satu klien anonim bisa melumpuhkan login SEMUA pengguna — dan
  // itu tidak menambah proteksi brute-force, karena limit per-email di
  // authorize() yang menjadi penjaganya (15 gagal/30 menit, kunci dari body
  // request sehingga tidak bisa dipalsukan header). Jadi pemblokiran berbasis
  // IP hanya dilakukan saat kunci per-klien benar-benar tersedia.
  const mayBlockOnIp = canBlockOnClientIp(ip);

  // Rate limit login attempts
  if (pathname === "/login" && req.method === "POST" && mayBlockOnIp) {
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

  // Sesi dibaca SEKALI di sini (sebelumnya di dua tempat terpisah): nilainya
  // dipakai untuk memilih kunci rate limit di bawah sekaligus untuk aturan
  // routing/otorisasi setelahnya.
  //
  // `secureCookie` harus mengikuti SKEMA REQUEST, sama seperti Auth.js saat
  // memilih antara `authjs.session-token` dan `__Secure-authjs.session-token`.
  // Menurunkannya dari NODE_ENV membuat build produksi yang disajikan lewat HTTP
  // polos (server e2e/CI, atau instalasi on-prem tanpa TLS) selalu gagal membaca
  // cookie → semua halaman memantul ke /login.
  const secureCookie = isSecureRequest(req);
  const token = await getToken({ req, secret: process.env.AUTH_SECRET, secureCookie });

  // Saat IP tidak tepercaya, semua klien berbagi satu bucket sehingga satu klien
  // anonim bisa menghabiskan kuota milik semua orang (DoS). Untuk permintaan yang
  // BER-SESI itu tidak perlu: identitas pengguna adalah kunci per-klien yang
  // nyata dan tidak bisa dipalsukan. Dengan begitu bucket bersama hanya menampung
  // permintaan anonim — dampaknya kecil karena /login dikecualikan (lihat di atas)
  // dan endpoint publik sudah di-allowlist di bawah.
  const rawUserId = (token as { id?: unknown } | null)?.id;
  const clientKey = clientRateLimitKey(
    ip,
    typeof rawUserId === "string" || typeof rawUserId === "number" ? rawUserId : null,
  );

  // Fix #25: API routes still need to pass through (they handle their own auth),
  // but we validate auth for sensitive API paths
  if (pathname.startsWith("/api")) {
    // NextAuth must stay reachable before a user has a session.
    if (pathname.startsWith("/api/auth")) {
      if (req.method === "POST" && mayBlockOnIp) {
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

    // Public reference data (Indonesian region list from bundled CSVs). Used by
    // the address pickers, including the first-run setup wizard which runs
    // before any session exists.
    if (pathname === "/api/address") {
      return addSecurityHeaders(req, NextResponse.next());
    }

    // Rate limit upload endpoints more strictly
    if (pathname.startsWith("/api/upload")) {
      const result = await takeRateLimit(`upload:${clientKey}`, RATE_LIMITS.upload);
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
      const result = await takeRateLimit(`api:${clientKey}`, RATE_LIMITS.api);
      if (!result.allowed) {
        return addSecurityHeaders(req, 
          NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }),
        );
      }
    }

    // All other API routes: check auth at proxy level
    // Fix C1: also enforce isActive — deactivated users must be blocked here so
    // they cannot use a still-valid JWT to hit routes that only call auth().
    if (!token || (token as { isActive?: boolean }).isActive === false) {
      return addSecurityHeaders(req, 
        NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 }),
      );
    }
    return addSecurityHeaders(req, NextResponse.next());
  }

  // Treat a deactivated user as not-logged-in for page routing. Otherwise the
  // dashboard layout redirects them to /login (deactivated), but the "logged-in
  // -> away from /login" rule below would bounce them back to / -> infinite loop.
  const isLoggedIn =
    !!token && (token as { isActive?: boolean }).isActive !== false;
  const isAuthPage = pathname.startsWith("/login");
  const isPublicPage =
    isAuthPage ||
    pathname === "/setup" ||
    pathname === "/ketentuan-layanan" ||
    pathname === "/kebijakan-privasi";

  // A deactivated (or password-changed) user can still carry a stale-but-valid
  // JWT cookie: the dashboard layout re-syncs against the DB via auth() and
  // redirects to /login?reason=deactivated, but the raw JWT this middleware
  // decodes here may still report isActive=true (re-sync only runs inside the
  // jwt callback, not in getToken). Bouncing such a "logged-in" user back to /
  // creates an infinite redirect loop (ERR_TOO_MANY_REDIRECTS). When /login
  // carries an explicit reason, render login instead of redirecting away — dan
  // bersihkan cookie sesinya hanya bila navigasinya dari aplikasi sendiri
  // (lihat isSameOriginRequest).
  const reason = req.nextUrl.searchParams.get("reason");
  if (isAuthPage && isLoggedIn && reason) {
    // Halaman login selalu dirender di sini (itu yang memutus loop redirect),
    // tetapi cookie sesi hanya dihapus kalau navigasinya memang berasal dari
    // aplikasi sendiri. Tanpa syarat itu, satu tautan lintas-situs ber-`?reason`
    // yang diklik korban dapat mengeluarkannya dari sesi (logout CSRF).
    const res = addSecurityHeaders(req, NextResponse.next());
    if (isSameOriginRequest(req)) {
      for (const cookie of req.cookies.getAll()) {
        if (SESSION_COOKIE_PATTERN.test(cookie.name)) {
          res.cookies.delete(cookie.name);
        }
      }
    }
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

  // Pengaturan sensitif — dijaga dengan PERMISSION yang sama seperti halaman &
  // action-nya (bukan nama role), supaya delegasi ke role lain tetap satu aturan.
  if (isLoggedIn) {
    const userRoles = (token?.roles as string[] | undefined) ?? [];
    const userPermissions = (token?.permissions as string[] | undefined) ?? [];
    const isSuperAdmin = userRoles.includes("super_admin");
    if (!isSuperAdmin) {
      for (const [pattern, permission] of SENSITIVE_ROUTE_PERMISSIONS) {
        if (pathname.startsWith(pattern) && !userPermissions.includes(permission)) {
          return NextResponse.redirect(new URL("/", req.url));
        }
      }
    }
  }

  return addSecurityHeaders(req, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
