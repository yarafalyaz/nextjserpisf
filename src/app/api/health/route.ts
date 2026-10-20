import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import {
  isRateLimitRedisConfigured,
  rateLimitDegradedCount,
} from "@/lib/security/rate-limit"

/**
 * Health check endpoint for monitoring and CI.
 * Returns 200 if app + DB are reachable, 503 otherwise.
 * `rateLimit` exposes the AUD-04 degradation signal: when Redis is not
 * configured or unreachable, limits fall back to per-process memory and
 * `degradedDecisions` grows — alert on it in multi-replica deployments.
 */
export async function GET() {
  try {
    // Verify DB connectivity with a lightweight query
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      rateLimit: {
        redisConfigured: isRateLimitRedisConfigured(),
        degradedDecisions: rateLimitDegradedCount(),
      },
    })
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Database unreachable",
      },
      { status: 503 }
    )
  }
}
