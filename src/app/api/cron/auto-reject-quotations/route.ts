import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { isValidCronRequest } from "@/lib/security/cron"
import { apiError } from "@/lib/api-response"
import { SalesStatus, Status } from "@/lib/constants"

/**
 * Cron: Auto-reject quotations that have been in 'sent' status for more than 14 days.
 * Schedule: Daily at midnight (0 0 * * *)
 *
 * F-36(c): hormati validUntil — auto-reject bila validUntil sudah lewat, ATAU
 * validUntil kosong dan updatedAt lebih dari 14 hari. Penawaran yang masih
 * dalam masa berlaku tidak mati hanya karena updatedAt tua.
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
    const now = new Date()

    const staleQuotations = await prisma.quotation.findMany({
      where: {
        status: SalesStatus.SENT,
        deletedAt: null,
        OR: [
          { validUntil: { lt: now } },
          { validUntil: null, updatedAt: { lt: cutoffDate } },
        ],
      },
    })

    if (staleQuotations.length === 0) {
      return NextResponse.json({ rejected: 0, message: "Tidak ada penawaran kedaluwarsa." })
    }

    // Idempotency contract: only reject quotations that are STILL in SENT
    // status at the moment of writing. If a user rejects a quotation between
    // our scan and the write, that row is silently skipped (its status is no
    // longer SENT, so the per-row conditional updateMany below affects
    // 0 rows for it and it gets no history entry). History uses a single
    // createMany; the flip itself is one conditional updateMany per row
    // so the exact set of flipped rows is known (a single bulk updateMany
    // only reports a total count, not which rows flipped).
    const { rejectedCount, rejectedIds } = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so we see a consistent snapshot.
      const candidates = await tx.quotation.findMany({
        where: {
          id: { in: staleQuotations.map((q) => q.id) },
          status: SalesStatus.SENT,
          deletedAt: null,
        },
        select: { id: true, revisionNumber: true },
      })
      if (candidates.length === 0) {
        return { rejectedCount: 0, rejectedIds: [] as number[] }
      }

      // Flip per baris bersyarat di dalam tx: count tiap updateMany
      // menyebut PERSIS baris mana yang ter-flip run ini. Baris yang
      // dibalik penulis lain di antara baca dan tulis memberi count 0
      // dan dilewati — history + rejectedIds hanya untuk baris ter-flip,
      // bukan daftar kandidat (satu updateMany massal hanya memberi
      // total count, tidak menyebut baris mana).
      const flippedCandidates: typeof candidates = []
      for (const c of candidates) {
        const res = await tx.quotation.updateMany({
          where: { id: c.id, status: SalesStatus.SENT },
          data: { status: Status.REJECTED },
        })
        if (res.count > 0) flippedCandidates.push(c)
      }

      if (flippedCandidates.length > 0) {
        await tx.quotationHistory.createMany({
          data: flippedCandidates.map((c) => ({
            quotationId: c.id,
            action: "auto_rejected",
            revisionNumber: c.revisionNumber,
            description: `Auto-rejected by system (masa berlaku lewat atau ${days} hari tanpa respons) (revisi v${c.revisionNumber})`,
          })),
        })
      }
      return { rejectedCount: flippedCandidates.length, rejectedIds: flippedCandidates.map((c) => c.id) }
    })

    return NextResponse.json({
      rejected: rejectedCount,
      message:
        rejectedCount === 0
          ? "Tidak ada penawaran kedaluwarsa yang masih berstatus terkirim saat penulisan."
          : `Berhasil menolak ${rejectedCount} penawaran kedaluwarsa.`,
      rejectedIds,
    })
  } catch (err) {
    console.error("Auto-reject quotations cron failed:", err)
    return apiError("INTERNAL_ERROR", "Tugas cron gagal dijalankan")
  }
}
