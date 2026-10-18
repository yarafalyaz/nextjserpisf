/**
 * Label Bahasa Indonesia untuk baris rekening koran.
 *
 * Sengaja LOKAL, bukan `STATUS_LABELS` umum di `src/lib/utils/status-labels.ts`:
 * peta umum tidak memuat `unmatched`/`matched` sama sekali, sehingga enum mentah
 * ("unmatched") akan tampil apa adanya ke pemakai padahal kolomnya berisi makna
 * "belum dicocokkan". Labelnya juga istilah rekonsiliasi bank, bukan status
 * umum dokumen ("Konsep", "Diposting").
 */

/** `BankStatementLine.status` → label tampilan. */
export const BANK_STATEMENT_LINE_STATUS_LABELS: Record<string, string> = {
  unmatched: "Belum dicocokkan",
  matched: "Sudah dicocokkan",
}

/** `BankStatementLine.type` → label tampilan (arah mutasi). */
export const BANK_STATEMENT_LINE_TYPE_LABELS: Record<string, string> = {
  debit: "Debit",
  credit: "Kredit",
}

/** Warna chip per status; bentuknya sama dengan `Tone` di `StatusChip`. */
export type BankStatementLineStatusTone = "success" | "warning" | "danger" | "default" | "accent"

export const BANK_STATEMENT_LINE_STATUS_TONES: Record<string, BankStatementLineStatusTone> = {
  unmatched: "warning",
  matched: "success",
}

/**
 * Label status baris. Nilai yang tidak dikenal dikembalikan apa adanya (jangan
 * disembunyikan) supaya status baru tidak pernah tampil kosong tanpa jejak.
 */
export function bankStatementLineStatusLabel(status: string): string {
  return BANK_STATEMENT_LINE_STATUS_LABELS[status] ?? status
}

/** Label arah mutasi; nilai tak dikenal dikembalikan apa adanya. */
export function bankStatementLineTypeLabel(type: string): string {
  return BANK_STATEMENT_LINE_TYPE_LABELS[type] ?? type
}
