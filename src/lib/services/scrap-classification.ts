/**
 * Klasifikasi scrap produksi per baris issue (F-2026-10-21-008).
 *
 * Vonis BOT 4 F-2026-10-22-066-V (PR #504) + putusan flag Lead MODE
 * CATAT-DULU (kartu t_38dfd895):
 * - Scrap NORMAL = porsi scrap ≤ allowance baris BOM (snapshot beku).
 *   Allowance 0/null = BELUM dikalibrasi → seluruh scrap ABNORMAL (P1).
 * - Nilai normal/abnormal = qty × cost FIFO terbawa baris, tepat sen.
 * - Gerbang jurnal P2(b): flag `abnormalScrapPostingEnabled` OFF (default)
 *   → nol jurnal, complete tidak ditolak akun kosong, abnormal jadi
 *   temuan laporan. ON → fail-closed: akun abnormal + WIP wajib terisi,
 *   tanpa fallback materialExpense/cogs (S4/S5).
 *
 * Pure (tanpa Prisma/DOM) — dipakai service tx kedua jalur issue dan
 * loader laporan; UI dilarang menghitung ulang.
 */

import { safeMultiply } from "@/lib/utils/math"

export const SCRAP_REASON_CODES = [
  "salah_potong",
  "gagal_las",
  "rusak_material",
  "sisa_tak_terpakai",
  "lainnya",
] as const

export type ScrapReasonCode = (typeof SCRAP_REASON_CODES)[number]

export const SCRAP_REASON_LABELS: Record<ScrapReasonCode, string> = {
  salah_potong: "Salah potong",
  gagal_las: "Gagal las",
  rusak_material: "Rusak material",
  sisa_tak_terpakai: "Sisa tak terpakai",
  lainnya: "Lainnya (wajib catatan)",
}

/** Kode alasan penampung catatan bebas pendamping `lainnya`. */
export const SCRAP_REASON_OTHER: ScrapReasonCode = "lainnya"

export function isScrapReasonCode(value: unknown): value is ScrapReasonCode {
  return typeof value === "string" && (SCRAP_REASON_CODES as readonly string[]).includes(value)
}

export interface ScrapLineInput {
  /** Qty keluar baris issue (aktual). */
  issueQty: number
  /** Qty rencana baris (BOM × qty order); 0 = baris unplanned. */
  plannedQty: number
  scrapQty: number
  scrapReasonCode?: string | null
  scrapNote?: string | null
  /** Allowance snapshot beku (%); null/0 = belum dikalibrasi. */
  scrapPercentSnapshot?: number | null
  /** Cost per unit terbawa FIFO baris (rupiah, boleh desimal). */
  unitCost: number
}

export interface ScrapClassification {
  scrapQty: number
  allowanceQty: number
  normalQty: number
  abnormalQty: number
  normalValue: number
  abnormalValue: number
  /** Allowance kosong/0 — tampil sebagai temuan kalibrasi, bukan normal. */
  uncalibrated: boolean
}

const EPS = 0.0001

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Validasi input scrap baris (P4): scrap > 0 wajib kode alasan sah;
 * `lainnya` wajib catatan. Mengembalikan pesan error Bahasa Indonesia
 * atau null bila sah. Dipakai di titik simpan draft DAN complete —
 * complete tidak boleh mengandalkan validasi form saja.
 */
export function validateScrapInput(input: {
  issueQty: number
  scrapQty: number
  scrapReasonCode?: string | null
  scrapNote?: string | null
}): string | null {
  const scrapQty = Number(input.scrapQty ?? 0)
  if (!Number.isFinite(scrapQty) || scrapQty < 0) {
    return "Qty scrap tidak boleh negatif."
  }
  if (scrapQty > Number(input.issueQty ?? 0) + EPS) {
    return "Qty scrap tidak boleh melebihi qty yang dikeluarkan pada baris yang sama."
  }
  if (scrapQty <= EPS) return null
  if (!isScrapReasonCode(input.scrapReasonCode)) {
    return "Baris dengan scrap wajib memiliki kode alasan scrap yang sah."
  }
  if (input.scrapReasonCode === SCRAP_REASON_OTHER && !(input.scrapNote ?? "").trim()) {
    return "Alasan scrap 'lainnya' wajib disertai catatan."
  }
  return null
}

/**
 * Klasifikasi satu baris saat complete. Allowance qty = plannedQty ×
 * snapshot% — snapshot dibekukan saat baris issue dibuat; fungsi ini
 * TIDAK membaca master BOM hidup.
 */
export function classifyScrapLine(input: ScrapLineInput): ScrapClassification {
  const scrapQty = Math.max(0, Number(input.scrapQty ?? 0))
  const plannedQty = Math.max(0, Number(input.plannedQty ?? 0))
  const percent = Number(input.scrapPercentSnapshot ?? 0)
  const uncalibrated = !Number.isFinite(percent) || percent <= 0
  const allowanceQty = uncalibrated ? 0 : round2(safeMultiply(plannedQty, percent / 100, 4))
  const normalQty = round2(Math.min(scrapQty, allowanceQty))
  const abnormalQty = round2(Math.max(0, scrapQty - normalQty))
  const unitCost = Number(input.unitCost ?? 0)
  return {
    scrapQty: round2(scrapQty),
    allowanceQty,
    normalQty,
    abnormalQty,
    normalValue: round2(safeMultiply(normalQty, unitCost, 4)),
    abnormalValue: round2(safeMultiply(abnormalQty, unitCost, 4)),
    uncalibrated,
  }
}

/**
 * Pool biaya WIP per job SETELAH kejadian issue (TASK-019): jurnal scrap
 * abnormal per kejadian mengkredit WIP keluar ke Beban Kerugian, jadi pool
 * yang boleh di-release ke barang jadi adalah biaya terbit dikurangi
 * abnormal yang SUDAH terjurnal. Tanpa pengurangan ini kredit WIP saat
 * complete memakai pool gross dan WIP per job negatif sebesar abnormal.
 * Flag OFF (catat-dulu) → abnormalPostedValue 0 → pool tetap gross, konsisten
 * dengan nol jurnal abnormal. Hasil tidak pernah negatif.
 */
export function wipCostPoolAfterIssue(input: {
  previousWipCost: number
  issuedCost: number
  abnormalPostedValue: number
}): number {
  const previous = round2(Number(input.previousWipCost ?? 0))
  const issued = round2(Number(input.issuedCost ?? 0))
  const abnormalPosted = round2(Number(input.abnormalPostedValue ?? 0))
  return Math.max(0, round2(previous + issued - abnormalPosted))
}

export interface AbnormalScrapGate {
  abnormalScrapPostingEnabled: boolean
  abnormalScrapExpenseAccountId: number | null
  wipAccountId: number | null
}

export type AbnormalScrapDecision =
  | { mode: "off"; journalAmount: 0 }
  | { mode: "on"; journalAmount: number; expenseAccountId: number; wipAccountId: number }

/**
 * Penjaga P2(b) di service tx (dipanggil hanya bila total abnormal > 0).
 * - Flag OFF → catat-dulu: nol jurnal, BUKAN error (complete lolos).
 * - Flag ON → fail-closed: akun kosong = lempar error; pemanggil wajib
 *   membiarkan tx rollback (nol jurnal parsial, S4).
 */
export function decideAbnormalScrapPosting(
  gate: AbnormalScrapGate,
  abnormalValue: number,
): AbnormalScrapDecision {
  const amount = round2(Number(abnormalValue ?? 0))
  if (amount <= 0) return { mode: "off", journalAmount: 0 }
  if (!gate.abnormalScrapPostingEnabled) return { mode: "off", journalAmount: 0 }
  if (gate.abnormalScrapExpenseAccountId == null || !(gate.abnormalScrapExpenseAccountId > 0)) {
    throw new Error(
      "Akun Beban Kerugian Produksi (abnormalScrapExpenseAccountId) belum dikonfigurasi — penyelesaian ditolak karena ada scrap abnormal dan mode jurnal scrap aktif (tanpa fallback ke beban lain).",
    )
  }
  if (gate.wipAccountId == null || !(gate.wipAccountId > 0)) {
    throw new Error(
      "Akun Barang Dalam Proses (WIP) belum dikonfigurasi — jurnal scrap abnormal tidak dapat dikredit dari WIP.",
    )
  }
  return {
    mode: "on",
    journalAmount: amount,
    expenseAccountId: gate.abnormalScrapExpenseAccountId,
    wipAccountId: gate.wipAccountId,
  }
}
