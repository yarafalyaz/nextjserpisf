/**
 * Penjaga kumulatif sisi jual (TASK-016), pola yang sama dengan
 * `findOverReturn` (retur) dan over-receive sisi beli: jumlah yang sudah
 * berjalan ditambah yang diminta tidak boleh menembus yang dipesan.
 *
 * Murni (tanpa Prisma) agar bisa diuji satuan; aksi memanggilnya di dalam
 * transaksi sesudah mengunci baris pesanan, dengan kuantitas yang sudah
 * dikonversi ke satuan dasar.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface CumulativeQtyViolation {
  /** Baris pesanan (DO) atau itemId (faktur), sesuai peta yang dinilai. */
  key: number
  requested: number
  ordered: number
  already: number
  /** ordered − already, dilantai 0. */
  remaining: number
}

/**
 * Pelanggaran pertama bila `already + requested > ordered` per kunci, atau
 * null bila semua kunci masih muat. Permintaan diagregasi per kunci oleh
 * pemanggil (peta `requestedByKey`). Kunci yang tidak ada di `orderedByKey`
 * dilewati: baris jasa tanpa padanan baris pesanan dinilai oleh cap nilai
 * (`cumulativeValueExcess`), bukan oleh cap kuantitas. Kunci dengan qty
 * pesanan tak terbaca (bukan angka finite) juga dilewati — data produksi
 * selalu punya qty, jadi ini hanya menjaga jalur mock/legacy tak runtuh.
 */
export function findCumulativeQtyExcess(
  requestedByKey: ReadonlyMap<number, number>,
  orderedByKey: ReadonlyMap<number, number>,
  alreadyByKey: ReadonlyMap<number, number>,
): CumulativeQtyViolation | null {
  for (const [key, requested] of requestedByKey) {
    const ordered = orderedByKey.get(key)
    if (ordered === undefined || !Number.isFinite(ordered)) continue
    const already = alreadyByKey.get(key) ?? 0
    if (safeAdd(already, requested, 4) > ordered + 1e-9) {
      return {
        key,
        requested,
        ordered,
        already,
        remaining: Math.max(0, safeSubtract(ordered, already, 4)),
      }
    }
  }
  return null
}

/**
 * Kelebihan nilai tertagih terhadap nilai acuan (grandTotal pesanan):
 * `alreadyBilled + candidate − cap`, dilantai 0, sen-aman (2 desimal).
 * Faktur non-batal menjumlah ke `alreadyBilled` (draft ikut memesan porsi,
 * definisi yang sama dengan faktur progres/selisih di job-billing).
 */
export function cumulativeValueExcess(
  alreadyBilled: number,
  candidateGrandTotal: number,
  capAmount: number,
): number {
  const excess = safeSubtract(safeAdd(alreadyBilled, candidateGrandTotal, 2), capAmount, 2)
  return excess > 0 ? excess : 0
}
