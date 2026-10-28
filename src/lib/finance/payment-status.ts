/**
 * FIN-BR-008 — reversal pembayaran berhistori: satu sumber penyaring baris
 * pembayaran yang sudah dibatalkan.
 *
 * Sejak reversal tidak lagi menghapus baris (histori + alasan disimpan),
 * baris `status = "reversed"` TETAP ADA di tabel. Setiap pembaca yang
 * menjumlah/menghitung uang WAJIB menyaringnya, kalau tidak uang yang sudah
 * dibatalkan ikut terhitung: sisa tagihan menyusut (pembayaran pengganti
 * ditolak), `hasRealSettlement` tetap true (SO/penawaran terkunci "sudah
 * dibayar"), dan laporan kas/piutang/bupot menggelembung.
 *
 * Yang TIDAK disaring: tampilan daftar/detail dokumen — baris batal memang
 * pantas terlihat, cukup berlabel (badge) di UI.
 *
 * Helper ini murni (tanpa Prisma) supaya bisa diuji tanpa DB dan dipakai
 * ulang sebagai fragmen `where` Prisma.
 */

/** Nilai `status` pembayaran yang sudah dibalik (SalesPayment & VendorPayment). */
export const PAYMENT_REVERSED = "reversed" as const

/** True bila baris pembayaran sudah dibalik. */
export function isReversedPayment(row: { status?: string | null } | null | undefined): boolean {
  return row?.status === PAYMENT_REVERSED
}

/**
 * `where` siap pakai untuk pembaca `salesPayment` yang menghitung uang.
 * Fragmen `status: { not: "reversed" }` dipasang paling akhir supaya tidak
 * bisa tertimpa oleh filter pemanggil yang keliru menulis `status` sendiri.
 */
export function activeSalesPaymentWhere<T extends Record<string, unknown>>(
  where?: T,
): T & { status: { not: typeof PAYMENT_REVERSED } } {
  return { ...((where ?? {}) as T), status: { not: PAYMENT_REVERSED } }
}

/**
 * Padanan untuk `vendorPayment`. Kolom `status` di sana sudah ada sejak lama
 * (`draft | completed | reversed`), jadi penyaringnya sama.
 */
export function activeVendorPaymentWhere<T extends Record<string, unknown>>(
  where?: T,
): T & { status: { not: typeof PAYMENT_REVERSED } } {
  return { ...((where ?? {}) as T), status: { not: PAYMENT_REVERSED } }
}
