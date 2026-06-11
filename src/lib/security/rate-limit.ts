type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

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

export function takeRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
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
