import { prisma } from "@/lib/db/prisma"

/**
 * Accounting period lock.
 *
 * SystemSetting.periodLockDate marks the close of an accounting period: no GL
 * posting (or reversal/edit) may be dated on or before that date. This prevents
 * back-dating entries into a period that has already been closed/reported.
 */
export async function assertPeriodOpen(transactionDate: Date): Promise<void> {
  const settings = await prisma.systemSetting.findFirst({ select: { periodLockDate: true } })
  const lock = settings?.periodLockDate
  if (!lock) return

  // Compare by calendar day (entries dated on/before the lock day are blocked).
  const txDay = new Date(transactionDate)
  txDay.setHours(0, 0, 0, 0)
  const lockDay = new Date(lock)
  lockDay.setHours(23, 59, 59, 999)

  if (txDay.getTime() <= lockDay.getTime()) {
    throw new Error(
      `Periode akuntansi sudah ditutup sampai ${lockDay.toLocaleDateString("id-ID")}. ` +
        `Transaksi bertanggal ${txDay.toLocaleDateString("id-ID")} tidak dapat diposting/diubah.`
    )
  }
}
