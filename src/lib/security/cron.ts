import { timingSafeEqual } from "node:crypto"

/**
 * Validate an incoming cron request against the configured CRON_SECRET.
 *
 * Fails closed: if no secret is configured, every request is rejected.
 * Requires an `Authorization: Bearer <secret>` header. The secret comparison
 * is constant-time (crypto.timingSafeEqual) to avoid leaking the secret via a
 * timing side-channel on byte-by-byte string comparison.
 */
export function isValidCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get("authorization")
  if (!header) return false

  const prefix = "Bearer "
  if (!header.startsWith(prefix)) return false
  const provided = header.slice(prefix.length)

  const expectedBuf = Buffer.from(secret)
  const providedBuf = Buffer.from(provided)

  // timingSafeEqual throws on length mismatch; comparing lengths first would
  // short-circuit and reintroduce a timing signal. Pad to equal length and
  // fold the length check into the constant-time result instead.
  if (expectedBuf.length !== providedBuf.length) {
    // Still run a comparison of equal-length buffers to keep timing uniform,
    // then return false regardless.
    timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }

  return timingSafeEqual(expectedBuf, providedBuf)
}
