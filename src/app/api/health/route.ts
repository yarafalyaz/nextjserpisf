import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"

/**
 * Health check endpoint for monitoring and CI.
 * Returns 200 if app + DB are reachable, 503 otherwise.
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
  } catch (error) {
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
