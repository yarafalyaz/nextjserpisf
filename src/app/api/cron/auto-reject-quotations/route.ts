import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
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
    return NextResponse.json({ error: "Tidak terotorisasi" }, { status: 401 })
  }

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

  // Idempotent: only update quotations that are STILL in SENT status at the
  // moment of writing. If another cron tick or a user already rejected this
  // quotation before we reach it, `count` is 0 and we skip without error.
  let rejectedCount = 0

  for (const quotation of staleQuotations) {
    const res = await prisma.quotation.updateMany({
      where: { id: quotation.id, status: SalesStatus.SENT },
      data: { status: Status.REJECTED },
    })
    if (res.count === 0) continue

    await prisma.quotationHistory.create({
      data: {
        quotationId: quotation.id,
        action: "auto_rejected",
        description: `Auto-rejected by system (expired after ${days} days without response)`,
      },
    })
    rejectedCount++
  }

  return NextResponse.json({
    rejected: rejectedCount,
    message: `Successfully rejected ${rejectedCount} stale quotations.`,
  })
}
