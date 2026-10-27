/**
 * Read-model SPT dari dokumen TaxInvoice (F-001/F-002) + snapshot retur
 * (F-004) + kewajiban per masa dari jurnal (F-005).
 *
 * Prinsip: dokumen TaxInvoice = sumber SPT bila ADA; tanpa dokumen,
 * fallback dokumen komersial berjalan DIIZINKAN berlabel `legacy`
 * (bukan diam-diam dianggap faktur pajak). Rantai pengganti: hanya
 * kepala rantai terakhir bernilai dan hanya bila `approved` —
 * `rejected`/`draft`/`cancelled`/`replaced` nol-efek. Masa keluaran =
 * taxPeriod dokumen (masa faktur asal untuk pengganti). Masa masukan =
 * creditPeriod (bukan taxPeriod, bukan tanggal tagihan), hanya
 * `creditStatus=credited`, faktur batal/tolak DJP tidak dikreditkan
 * walau status kredit lama masih `credited`, dan nilai kredit sebesar
 * `creditablePercent` (bukan selalu 100%).
 *
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { creditableSplit, effectiveChainHead, type ChainInvoice } from "@/lib/tax/tax-invoice"

export type SptSource = "tax_invoice" | "legacy" | "mixed"

export interface SptOutputRow {
  /** Masa SPT "YYYY-MM" (masa faktur asal rantai). */
  period: string
  dpp: number
  vat: number
  /** Jumlah faktur kepala rantai pada masa ini. */
  count: number
  source: SptSource
}

export interface SptInputRow {
  /** Masa kredit "YYYY-MM". */
  period: string
  dpp: number
  vat: number
  count: number
  source: SptSource
}

/** Faktur keluaran kandidat SPT: satu rantai (asal → pengganti). */
export interface OutputChain {
  chain: ChainInvoice[]
  /** Masa faktur ASAL rantai (masa SPT pengganti, PER-11/PJ/2025). */
  originPeriod: string
}

export function buildOutputSptRows(chains: OutputChain[]): SptOutputRow[] {
  const byPeriod = new Map<string, SptOutputRow>()
  for (const { chain, originPeriod } of chains) {
    const head = effectiveChainHead(chain)
    if (!head) continue
    const row = byPeriod.get(originPeriod) ?? {
      period: originPeriod,
      dpp: 0,
      vat: 0,
      count: 0,
      source: "tax_invoice" as const,
    }
    row.dpp = safeAdd(row.dpp, head.dpp, 2)
    row.vat = safeAdd(row.vat, head.taxAmount, 2)
    row.count += 1
    byPeriod.set(originPeriod, row)
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
}

/** Satu faktur masukan terdaftar (dokumen TaxInvoice arah `in`). */
export interface InputInvoiceRow {
  taxPeriod: string
  creditPeriod: string | null
  creditStatus: string
  dpp: number
  taxAmount: number
  /** Status DJP; `cancelled`/`rejected` nol-efek walau kredit lama masih tercatat. */
  djpStatus?: string
  /** Porsi kreditabel 0–100; absen diperlakukan 100 (data lama). */
  creditablePercent?: number | null
}

export function buildInputSptRows(invoices: InputInvoiceRow[]): SptInputRow[] {
  const byPeriod = new Map<string, SptInputRow>()
  for (const inv of invoices) {
    if (inv.creditStatus !== "credited" || !inv.creditPeriod) continue
    // Faktur batal/tolak DJP tidak dikreditkan, walau `cancelTaxInvoice`
    // tidak mengosongkan creditStatus/creditPeriod pada data lama.
    if (inv.djpStatus === "cancelled" || inv.djpStatus === "rejected") continue
    const pct = inv.creditablePercent ?? 100
    const row = byPeriod.get(inv.creditPeriod) ?? {
      period: inv.creditPeriod,
      dpp: 0,
      vat: 0,
      count: 0,
      source: "tax_invoice" as const,
    }
    row.dpp = safeAdd(row.dpp, creditableSplit(inv.dpp, pct).creditable, 2)
    row.vat = safeAdd(row.vat, creditableSplit(inv.taxAmount, pct).creditable, 2)
    row.count += 1
    byPeriod.set(inv.creditPeriod, row)
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
}

/**
 * Fallback legacy PER DOKUMEN: `legacy` harus sudah berisi HANYA dokumen
 * komersial yang belum punya TaxInvoice (pemfilteran per dokumen di
 * loader). Baris legacy pada masa yang juga punya baris TaxInvoice
 * DITAMBAHKAN dan berlabel `mixed` — bukan dibuang; masa tanpa
 * TaxInvoice tetap berlabel `legacy`.
 */
export function withLegacyFallback(
  rows: SptOutputRow[] | SptInputRow[],
  legacy: { period: string; dpp: number; vat: number; count: number }[],
): (SptOutputRow | SptInputRow)[] {
  const byPeriod = new Map<string, SptOutputRow | SptInputRow>()
  for (const row of rows) byPeriod.set(row.period, { ...row })
  for (const leg of legacy) {
    if (leg.count === 0) continue
    const existing = byPeriod.get(leg.period)
    if (!existing) {
      byPeriod.set(leg.period, { ...leg, source: "legacy" })
      continue
    }
    existing.dpp = safeAdd(existing.dpp, leg.dpp, 2)
    existing.vat = safeAdd(existing.vat, leg.vat, 2)
    existing.count += leg.count
    existing.source = "mixed"
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
}

/** Baris retur penjualan untuk pengurang masa (snapshot atau legacy). */
export interface ReturnDeductionRow {
  /** Masa pengurang: tanggal nota retur, else tanggal retur (F-004). */
  period: string
  dpp: number
  vat: number
  /** Baris ini dari snapshot beku (bukan hitung-ulang saat baca). */
  snapshot: boolean
}

export function buildReturnDeductionRows(rows: ReturnDeductionRow[]): {
  byPeriod: { period: string; dpp: number; vat: number; count: number; legacyCount: number }[]
} {
  const byPeriod = new Map<
    string,
    { period: string; dpp: number; vat: number; count: number; legacyCount: number }
  >()
  for (const r of rows) {
    const row = byPeriod.get(r.period) ?? { period: r.period, dpp: 0, vat: 0, count: 0, legacyCount: 0 }
    row.dpp = safeAdd(row.dpp, r.dpp, 2)
    row.vat = safeAdd(row.vat, r.vat, 2)
    row.count += 1
    if (!r.snapshot) row.legacyCount += 1
    byPeriod.set(r.period, row)
  }
  return { byPeriod: [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period)) }
}

/** Posisi PPN satu masa: keluaran − pengurang retur − masukan. */
export function netVatForPeriod(input: {
  outputVat: number
  returnVat: number
  inputVat: number
}): { net: number; kurangBayar: boolean } {
  const net = safeSubtract(safeSubtract(input.outputVat, input.returnVat, 2), input.inputVat, 2)
  return { net, kurangBayar: net >= 0 }
}
