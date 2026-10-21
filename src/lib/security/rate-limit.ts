import { Redis } from "@upstash/redis"

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Periodic cleanup of expired buckets to prevent unbounded memory growth in
// long-lived Node.js processes. Only registered once per process.
let cleanupRegistered = false
function registerCleanup() {
  if (cleanupRegistered) return
  cleanupRegistered = true
  // Use unref so the timer doesn't keep the event loop alive
  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key)
    }
  }, 60_000) // every minute
  // unref() so the timer doesn't keep the event loop alive
  if (typeof timer.unref === "function") timer.unref()
}

export type RateLimitConfig = {
  windowMs: number
  max: number
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
  /** true bila dihitung dari Map lokal (Redis tak ada/gagal). Batas jadi
   * PER-PROSES, bukan global — deployment multi-replica tanpa Redis
   * mengalikan batas sejumlah proses. Prod WAJIB set Upstash Redis. */
  degraded?: boolean
}

/** Counter fallback aktif (metrik/alert): berapa keputusan dari Map lokal. */
let degradedDecisions = 0
export function rateLimitDegradedCount(): number {
  return degradedDecisions
}

/** Apakah Upstash Redis terkonfigurasi (batas global antar-proses)? */
export function isRateLimitRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  )
}

/**
 * AUD-04 fail-closed: di produksi, keputusan rate limit yang DEGRADED
 * (fallback memori per-proses) untuk bucket sensitif (auth/upload)
 * diperlakukan sebagai DITOLAK, supaya brute-force tidak mendapat batas
 * longgar justru saat Redis mati. Matikan darurat dengan
 * RATE_LIMIT_FAIL_CLOSED=0 bila fallback harus tetap meloloskan.
 */
export function isRateLimitFailClosed(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.RATE_LIMIT_FAIL_CLOSED !== "0"
  )
}

let warnedMissingRedis = false
/** Peringatkan sekali per proses bila produksi berjalan tanpa Redis. */
export function warnRateLimitRedisMissingOnce(): void {
  if (warnedMissingRedis) return
  if (process.env.NODE_ENV !== "production") return
  if (isRateLimitRedisConfigured()) return
  warnedMissingRedis = true
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN tidak diset di produksi: " +
      "rate limit memakai fallback per-proses dan bucket sensitif fail-closed (AUD-04).",
  )
}

function nowMs() {
  return Date.now()
}

// ── Upstash Redis (lazy singleton) ──────────────────────────────────────────
let redisInstance: Redis | null = null

function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  if (!redisInstance) {
    redisInstance = new Redis({ url, token })
  }
  return redisInstance
}

/**
 * Lua script that runs atomically inside Redis:
 *   1. INCR key
 *   2. On first hit (count == 1) set PX (TTL) = windowMs
 *   3. Read current TTL to compute resetAt
 *   4. Return [allowed (0|1), remaining, resetAt]
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now   = tonumber(ARGV[3])

local count = redis.call('INCR', key)
if count == 1 then
  redis.call('PEXPIRE', key, window)
end

local ttl = redis.call('PTTL', key)
if ttl < 0 then ttl = 0 end

local resetAt = now + ttl
local allowed = 1
local remaining = limit - count
if remaining < 0 then remaining = 0 end
if count > limit then allowed = 0 end

return { allowed, remaining, resetAt }
`

// ── In-memory fallback ──────────────────────────────────────────────────────
function peekInMemRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = nowMs()
  const current = buckets.get(key)

  if (!current || now >= current.resetAt) {
    return { allowed: true, remaining: config.max, resetAt: now + config.windowMs, degraded: true }
  }

  // `allowed` answers "would the NEXT attempt be accepted?", matching
  // takeRateLimit(), which counts the attempt before comparing with max.
  return {
    allowed: current.count < config.max,
    remaining: Math.max(0, config.max - current.count),
    resetAt: current.resetAt,
    degraded: true,
  }
}

function takeInMemRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  degradedDecisions += 1
  registerCleanup()
  const now = nowMs()
  const current = buckets.get(key)

  if (!current || now >= current.resetAt) {
    const resetAt = now + config.windowMs
    buckets.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: Math.max(0, config.max - 1),
      resetAt,
      degraded: true,
    }
  }

  current.count += 1
  buckets.set(key, current)

  const allowed = current.count <= config.max
  return {
    allowed,
    remaining: Math.max(0, config.max - current.count),
    resetAt: current.resetAt,
    degraded: true,
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
/**
 * Single entry point. When Upstash Redis env vars are set, runs an atomic
 * Lua INCR+EXPIRE script for cross-instance accuracy. Otherwise falls back
 * to the in-process Map (suitable for single-instance / dev). The signature
 * is always async so callers don't need to branch.
 */
export async function takeRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const client = getRedisClient()
  if (!client) {
    return takeInMemRateLimit(key, config)
  }

  const now = nowMs()
  const windowMs = config.windowMs
  const max = config.max

  return client
    .eval(RATE_LIMIT_LUA, [key], [windowMs.toString(), max.toString(), now.toString()])
    .then((res) => {
      // res is [allowed, remaining, resetAt]
      const [allowed, remaining, resetAt] = res as [number, number, number]
      return {
        allowed: allowed === 1,
        remaining,
        resetAt,
      }
    })
    .catch((err) => {
      // Graceful degradation: if Redis is unreachable, fall back to in-memory
      // (degraded:true + counter; alert bila ini naik di prod = Redis mati).
      console.error("[rate-limit] Redis error, falling back to in-memory:", err)
      return takeInMemRateLimit(key, config)
    })
}

/**
 * Check the current state of a bucket WITHOUT consuming an attempt.
 *
 * Needed by the login flow: the per-email limit must block an attacker after N
 * failed attempts, yet not punish a legitimate user who signs in repeatedly. The
 * caller therefore PEEKS before authenticating and only calls takeRateLimit() to
 * record an attempt once the credentials turned out to be wrong.
 */
export async function peekRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const client = getRedisClient()
  if (!client) {
    return peekInMemRateLimit(key, config)
  }

  try {
    const [raw, ttl] = await Promise.all([client.get<number>(key), client.pttl(key)])
    const count = Number(raw ?? 0)
    if (!Number.isFinite(count) || count <= 0) {
      return { allowed: true, remaining: config.max, resetAt: nowMs() + config.windowMs }
    }
    const remainingTtl = typeof ttl === "number" && ttl > 0 ? ttl : config.windowMs
    return {
      allowed: count < config.max,
      remaining: Math.max(0, config.max - count),
      resetAt: nowMs() + remainingTtl,
    }
  } catch (err) {
    console.error("[rate-limit] Redis peek error, falling back to in-memory:", err)
    return peekInMemRateLimit(key, config)
  }
}

/**
 * Resolve the actual client IP from a request.
 *
 * Priority:
 *   1. `req.ip` — TCP connection IP, only populated by some runtimes. Next.js
 *      removed it in v15, so on Next 16 this branch is effectively dead and the
 *      headers below are the only source.
 *   2. …all header sources: `cf-connecting-ip`, `x-real-ip` (nginx/proxy) and
 *      `x-forwarded-for` (rightmost entry).
 *
 * SECURITY: every header above is attacker-controlled unless a reverse proxy is
 * guaranteed to overwrite (or strip) it. A direct-to-app deployment that honored
 * `cf-connecting-ip` unconditionally let any client rotate its rate-limit bucket
 * per request by sending a fresh value, defeating every limit in proxy.ts
 * (login/auth/upload/API). Header trust is therefore gated behind an explicit
 * `TRUSTED_PROXY=1` opt-in; without it no header is trusted and every untrusted
 * caller shares the `"unknown"` bucket.
 *
 * When `TRUSTED_PROXY` is unset and the app IS behind a proxy, rate limiting
 * degrades to a single shared counter. Set `TRUSTED_PROXY=1` (see .env.example)
 * in that deployment so per-client limits work.
 */

/**
 * Nilai kembalian getClientIp() saat tidak ada identitas klien yang bisa
 * dipercaya: TRUSTED_PROXY belum diset dan runtime tidak menyediakan req.ip.
 * Semua klien berbagi kunci ini, jadi bucket-nya tidak boleh dipakai untuk
 * memblokir permintaan — lihat canBlockOnClientIp().
 */
export const UNKNOWN_CLIENT_KEY = "unknown"

let warnedAboutUntrustedProxy = false

/**
 * Returns the shared fallback bucket key. Emits a one-time production warning so
 * an operator who forgot TRUSTED_PROXY notices, instead of silently serving every
 * client from a single rate-limit counter (which would both weaken per-client
 * limiting and let one abusive client exhaust the shared bucket).
 */
function warnUntrustedOnce(): string {
  if (!warnedAboutUntrustedProxy && process.env.NODE_ENV === "production") {
    warnedAboutUntrustedProxy = true
    console.warn(
      "[rate-limit] TRUSTED_PROXY is not set: client-IP headers are ignored, so every " +
        "caller shares one rate-limit bucket. Set TRUSTED_PROXY=1 when the app runs " +
        "behind a reverse proxy / Cloudflare so per-client limits work.",
    )
  }
  return UNKNOWN_CLIENT_KEY
}

export function getClientIp(req: Request & { ip?: string }): string {
  // 1. Direct TCP address — trustworthy when the runtime provides it.
  if (req.ip) return req.ip

  // 2-4: Only trust reverse-proxy headers when explicitly gated.
  if (process.env.TRUSTED_PROXY !== "1") return warnUntrustedOnce()

  // 2. Cloudflare
  const cf = req.headers.get("cf-connecting-ip")
  if (cf?.trim()) return cf.trim()

  // 3. X-Real-IP (nginx / reverse proxy)
  const xri = req.headers.get("x-real-ip")
  if (xri?.trim()) return xri.trim()

  // 4. X-Forwarded-For — take the RIGHTMOST IP (last proxy in chain)
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const ips = xff.split(",").map((s) => s.trim()).filter(Boolean)
    const rightmost = ips[ips.length - 1]
    if (rightmost) return rightmost
  }

  // 5. Nothing
  return UNKNOWN_CLIENT_KEY
}

/**
 * Bolehkah bucket per-IP dipakai untuk MEMBLOKIR permintaan?
 *
 * Saat identitas klien tidak tepercaya, semua klien berbagi satu bucket
 * (UNKNOWN_CLIENT_KEY). Memblokir berdasarkan bucket bersama itu memberi satu
 * klien anonim senjata DoS: begitu bucket habis, permintaan semua pengguna lain
 * ikut ditolak — pada /login, artinya tidak ada seorang pun yang bisa masuk.
 * Limit seperti itu juga tidak menambah proteksi brute-force, sebab penyerang
 * adalah satu-satunya konsumen bucket tersebut sampai semua orang terkunci.
 * Proteksi login yang sebenarnya ada di limit per-email (`authorize()`), yang
 * kuncinya berasal dari body request dan tidak bisa dipalsukan lewat header.
 *
 * Saat TRUSTED_PROXY=1 (atau runtime menyediakan req.ip) kunci per-klien nyata
 * tersedia, sehingga pemblokiran per-IP tetap berlaku.
 */
export function canBlockOnClientIp(ip: string): boolean {
  return ip !== UNKNOWN_CLIENT_KEY
}

/**
 * Pilih kunci bucket untuk lalu lintas non-auth (API/upload).
 *
 * Saat kunci per-klien tersedia (IP tepercaya), pakai itu seperti semula. Saat
 * IP tidak tepercaya, semua klien berbagi satu bucket — dan itu memberi klien
 * anonim senjata DoS. Untuk permintaan BER-SESI itu tidak perlu: identitas
 * pengguna adalah kunci per-klien yang nyata dan tidak bisa dipalsukan, sehingga
 * bucket bersama hanya menampung permintaan anonim.
 *
 * `userId` boleh string atau number: `token.id` diisi lewat `String(user.id)`.
 */
export function clientRateLimitKey(
  ip: string,
  userId: string | number | null | undefined,
): string {
  if (canBlockOnClientIp(ip)) return ip
  if (userId === null || userId === undefined || userId === "") return UNKNOWN_CLIENT_KEY
  return `user:${userId}`
}
