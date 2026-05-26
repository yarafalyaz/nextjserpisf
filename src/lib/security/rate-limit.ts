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

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0]?.trim() || "unknown"
  const xri = req.headers.get("x-real-ip")
  if (xri) return xri.trim()
  return "unknown"
}
