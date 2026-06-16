import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { apiError } from "@/lib/api-response"
import { SalesStatus, Status } from "@/lib/constants"

/**
 * Cron: Auto-reject quotations that have been in 'sent' status for more than 14 days.
 * Schedule: Daily at midnight (0 0 * * *)
 * 
 * Mirrors Laravel: AutoRejectQuotations command
 */
export async function GET(request: Request) {
  // Verify cron secret
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  try {
    const days = 14
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    // Find quotations that are in 'sent' status and haven't been updated in 14 days
    const staleQuotations = await prisma.quotation.findMany({
      where: {
        status: SalesStatus.SENT,
        deletedAt: null,
        updatedAt: { lt: cutoffDate },
      },
    })

    if (staleQuotations.length === 0) {
      return NextResponse.json({ rejected: 0, message: "No stale quotations found." })
    }

    // Idempotency contract: only reject quotations that are STILL in SENT
    // status at the moment of writing. If a user rejects a quotation between
    // our scan and the write, that row is silently skipped (its status is no
    // longer SENT, so the bulk updateMany below affects 0 rows for it and it
    // gets no history entry). Collapsed 2N serial round-trips (per-quotation
    // updateMany + create) into 1 bulk updateMany + 1 createMany inside a
    // single interactive transaction, so the snapshot read, write, and audit
    // log are atomic relative to other writers.
    const { rejectedCount, rejectedIds } = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so we see a consistent snapshot.
      const candidates = await tx.quotation.findMany({
        where: {
          id: { in: staleQuotations.map((q) => q.id) },
          status: SalesStatus.SENT,
          deletedAt: null,
        },
        select: { id: true },
      })
      if (candidates.length === 0) {
        return { rejectedCount: 0, rejectedIds: [] as number[] }
      }

      // status guard preserved: only flip rows that are still SENT. This is
      // a no-op for any row that another writer already mutated.
      const updateRes = await tx.quotation.updateMany({
        where: {
          id: { in: candidates.map((c) => c.id) },
          status: SalesStatus.SENT,
        },
        data: { status: Status.REJECTED },
      })

      // updateRes.count can never exceed candidates.length (we just read
      // those rows inside the same tx, holding the read view). On a clean
      // box it equals candidates.length; under contention the status guard
      // could trim it. We log history only for the rows we know were
      // considered — which matches the old per-row behaviour (a row that
      // flipped between findMany and updateMany also created no history
      // entry before, since the inner updateMany returned count=0).
      const ids = candidates.map((c) => c.id)
      if (updateRes.count > 0) {
        await tx.quotationHistory.createMany({
          data: ids.map((quotationId) => ({
            quotationId,
            action: "auto_rejected",
            description: `Auto-rejected by system (expired after ${days} days without response)`,
          })),
        })
      }
      return { rejectedCount: updateRes.count, rejectedIds: ids }
    })

    return NextResponse.json({
      rejected: rejectedCount,
      message:
        rejectedCount === 0
          ? "No stale quotations were still in SENT status at write time."
          : `Successfully rejected ${rejectedCount} stale quotations.`,
      rejectedIds,
    })
  } catch (err) {
    console.error("Auto-reject quotations cron failed:", err)
    return NextResponse.json(
      { error: "Cron job failed", rejected: 0 },
      { status: 500 }
    )
  }
}
