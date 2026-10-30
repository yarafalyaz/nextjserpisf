import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

/**
 * Health check endpoint for monitoring and CI.
 * Returns 200 if app + DB are reachable, 503 otherwise.
 * R7PB-06: field rate-limit internal (redisConfigured/degradedDecisions)
 * tidak lagi dipaparkan ke publik anonim — sinyal itu untuk operator via
 * metrik/log internal, bukan endpoint publik.
 */
export async function GET() {
  try {
    // Verify DB connectivity with a lightweight query
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
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
