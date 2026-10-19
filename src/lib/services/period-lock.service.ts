import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * Accounting period lock.
 *
 * SystemSetting.periodLockDate marks the close of an accounting period: no GL
 * posting (or reversal/edit) may be dated on or before that date. This prevents
 * back-dating entries into a period that has already been closed/reported.
 *
 * R-09 (TOCTOU): bila pemanggil memberi `tx`, tanggal kunci dibaca lewat
 * locking read atas baris tunggal `system_settings`
 * (`... ORDER BY id LIMIT 1 FOR UPDATE`). Baris itu terkunci sampai tx
 * pemanggil commit/rollback, jadi tutup-periode (yang mengambil kunci yang
 * sama, lihat period-close.actions.ts) tidak bisa menyelip di antara cek ini
 * dan tulis pemanggil: salah satu pihak menang secara serial — penulis
 * membaca kunci baru lalu menolak, atau penulis commit lebih dulu dan
 * tutup-periode menunggu sampai tulisannya selesai. Tanpa `tx` perilaku lama
 * dipertahankan (findFirst tanpa kunci) untuk jalur baca/fast-fail.
 */
export async function assertPeriodOpen(transactionDate: Date, tx?: TxClient): Promise<void> {
  let lock: Date | null | undefined

  if (tx) {
    const rows = await tx.$queryRaw<Array<{ id: number; period_lock_date: Date | string | null }>>`
      SELECT id, period_lock_date FROM system_settings ORDER BY id LIMIT 1 FOR UPDATE
    `
    const rawLock = rows[0]?.period_lock_date
    lock = rawLock == null ? rawLock : new Date(rawLock)
  } else {
    const settings = await prisma.systemSetting.findFirst({ select: { periodLockDate: true } })
    lock = settings?.periodLockDate
  }

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
