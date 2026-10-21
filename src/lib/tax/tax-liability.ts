/**
 * Kewajiban pajak per (jenis, masa) dari JURNAL POSTED (F-005).
 *
 * Vonis FINAL accountant F-2026-10-21-005:
 * - Sumber kewajiban = JURNAL, bukan SPT saja, bukan input bebas.
 *   Saldo kewajiban masa = Σ kredit − debit POSTED per akun pajak
 *   (PPN Keluaran − PPN Masukan untuk PPN; akun Utang PPh per jenis
 *   untuk potong), direkonsiliasi ke posisi SPT.
 * - Selisih jurnal vs SPT = temuan ditampilkan, bukan dipilih diam-diam.
 * - Read-model: kewajiban masa, sudah disetor, sisa — per (jenis, masa).
 * - Setor > sisa → peringatan keras (bukan blokir: setor lebih sah
 *   sebagai pembayaran dimuka, tampil sebagai lebih-bayar).
 *
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

/** Jenis pajak terstruktur TaxPayment.taxKind. */
export const TAX_KINDS = ["ppn", "pph21", "pph23", "pph4_2", "pph_badan", "other"] as const
export type TaxKind = (typeof TAX_KINDS)[number]

export function isTaxKind(value: unknown): value is TaxKind {
  return typeof value === "string" && (TAX_KINDS as readonly string[]).includes(value)
}

/** Format masa YYYY-MM + bulan 01-12 (bukan teks bebas). */
export function isValidTaxPeriod(period: unknown): period is string {
  if (typeof period !== "string") return false
  if (!/^\d{4}-\d{2}$/.test(period)) return false
  const m = Number(period.slice(5, 7))
  return m >= 1 && m <= 12
}

/** Kode billing MPN: tepat 15 digit. */
export function isValidBillingCode(value: unknown): boolean {
  return typeof value === "string" && /^\d{15}$/.test(value)
}

/** NTPN: tepat 16 karakter. */
export function isValidNtpn(value: unknown): boolean {
  return typeof value === "string" && value.length === 16
}

export interface JournalTaxLeg {
  /** "ppn_out" | "ppn_in" | "pph:<typeId>" — kunci agregasi kewajiban. */
  bucket: string
  debit: number
  credit: number
}

export interface TaxPaymentLeg {
  bucket: string
  amount: number
}

/**
 * Kewajiban masa = Σ kredit − debit POSTED per bucket; PPN neto =
 * keluaran − masukan. Setor dialokasikan per bucket; sisa = kewajiban
 * − setor (negatif = lebih-bayar, tampil bukan blokir).
 */
export function buildTaxLiability(input: {
  journalLegs: JournalTaxLeg[]
  payments: TaxPaymentLeg[]
  sptPosition?: { bucket: string; amount: number }[]
}): {
  rows: { bucket: string; liability: number; paid: number; balance: number; overpaid: boolean }[]
  findings: { bucket: string; journal: number; spt: number; diff: number }[]
} {
  const liabilityBy = new Map<string, number>()
  for (const leg of input.journalLegs) {
    const net = safeSubtract(leg.credit, leg.debit, 2)
    liabilityBy.set(leg.bucket, safeAdd(liabilityBy.get(leg.bucket) ?? 0, net, 2))
  }
  const paidBy = new Map<string, number>()
  for (const p of input.payments) {
    paidBy.set(p.bucket, safeAdd(paidBy.get(p.bucket) ?? 0, safeAdd(0, p.amount, 2), 2))
  }
  const buckets = [...new Set([...liabilityBy.keys(), ...paidBy.keys()])].sort()
  const rows = buckets.map((bucket) => {
    const liability = liabilityBy.get(bucket) ?? 0
    const paid = paidBy.get(bucket) ?? 0
    const balance = safeSubtract(liability, paid, 2)
    return { bucket, liability, paid, balance, overpaid: balance < 0 }
  })
  const findings: { bucket: string; journal: number; spt: number; diff: number }[] = []
  for (const s of input.sptPosition ?? []) {
    const journal = liabilityBy.get(s.bucket) ?? 0
    const diff = safeSubtract(journal, s.amount, 2)
    if (diff !== 0) findings.push({ bucket: s.bucket, journal, spt: s.amount, diff })
  }
  return { rows, findings }
}

/** Bucket PPN keluaran vs masukan → neto keluaran − masukan. */
export function netPpnLiability(output: number, inputVat: number): number {
  return safeSubtract(output, inputVat, 2)
}
