import { computeDueDate } from "@/lib/finance/vendor-bill"

/**
 * R8-JB-09 lanjutan: rencana backfill dueDate dokumen LAMA yang terbuka.
 *
 * Dokumen lahir sebelum dueDate diturunkan dari termin lawan punya
 * dueDate null walau lawannya ber-termin — aging melewatinya (query
 * mensyaratkan dueDate not null), jadi hutang/piutang itu tak pernah
 * menua. Backfill hanya menyentuh dokumen TERBUKA (posted/partial)
 * ber-dueDate null dari termin lawan yang AKTIF; dokumen lunas/batal
 * dan yang sudah ber-dueDate adalah fakta historis — tidak disentuh.
 * Idempoten: sesudah terisi, baris tidak lagi kandidat.
 */
export interface DueDateBackfillCandidate {
  id: number
  date: Date
  /** Hari termin lawan; null = lawan tanpa termin aktif → lewati. */
  termDays: number | null
}

export interface DueDateBackfillPlan {
  id: number
  dueDate: Date
}

/** Baris yang akan diisi dueDate (date + termDays), urut id. */
export function planDueDateBackfill(
  candidates: readonly DueDateBackfillCandidate[],
): DueDateBackfillPlan[] {
  const plans: DueDateBackfillPlan[] = []
  for (const c of candidates) {
    const dueDate = computeDueDate(c.date, c.termDays)
    if (dueDate) plans.push({ id: c.id, dueDate })
  }
  return plans.sort((a, b) => a.id - b.id)
}
