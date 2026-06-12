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
function takeInMemRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
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
    }
  }

  current.count += 1
  buckets.set(key, current)

  const allowed = current.count <= config.max
  return {
    allowed,
    remaining: Math.max(0, config.max - current.count),
    resetAt: current.resetAt,
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
      console.error("[rate-limit] Redis error, falling back to in-memory:", err)
      return takeInMemRateLimit(key, config)
    })
}

/**
 * Resolve the actual client IP from a request.
 *
 * Priority:
 *   1. `req.ip` — NextRequest's TCP connection IP (always trustworthy)
 *   2. `cf-connecting-ip` — Cloudflare, tamper-proof (set by CF edge)
 *   3. `x-real-ip` — nginx / reverse proxy (only if TRUSTED_PROXY is set)
 *   4. `x-forwarded-for` — rightmost IP, i.e. the closest proxy.
 *      Only read when TRUSTED_PROXY=1 is set in env; otherwise an attacker
 *      can spoof the header and rotate the rate-limit key.
 *   5. `"unknown"` — nothing available
 */
export function getClientIp(req: Request & { ip?: string }): string {
  // 1. NextRequest.ip — direct TCP address, can't be spoofed
  if (req.ip) return req.ip

  // 2. Cloudflare
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf

  // 3-4: Only trust reverse-proxy headers when explicitly gated
  const trusted = process.env.TRUSTED_PROXY === "1"

  if (trusted) {
    // 3. X-Real-IP (nginx / reverse proxy)
    const xri = req.headers.get("x-real-ip")
    if (xri) return xri.trim()

    // 4. X-Forwarded-For — take the RIGHTMOST IP (last proxy in chain)
    const xff = req.headers.get("x-forwarded-for")
    if (xff) {
      const ips = xff.split(",").map((s) => s.trim()).filter(Boolean)
      const rightmost = ips[ips.length - 1]
      if (rightmost) return rightmost
    }
  }

  // 5. Nothing
  return "unknown"
}
