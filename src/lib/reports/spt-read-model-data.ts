/**
 * Loader read-model SPT (F-001/F-002/F-004/F-005).
 *
 * Dipakai bersama loader laporan `pajak` (PDF-only) dan halaman layar
 * `/laporan/pajak`: satu sumber kebenaran masa SPT. Memakai dokumen
 * TaxInvoice bila ada; masa tanpa dokumen TaxInvoice jatuh ke fallback
 * dokumen komersial berjalan berlabel `legacy`. Kewajiban PPN per masa
 * dari JURNAL POSTED (akun PPN Keluaran − Masukan dari SystemSetting),
 * direkonsiliasi ke posisi SPT dokumen — selisih tampil sebagai temuan,
 * bukan dipilih diam-diam.
 */

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import {
  buildOutputSptRows,
  buildInputSptRows,
  buildReturnDeductionRows,
  withLegacyFallback,
  netVatForPeriod,
  type OutputChain,
} from "@/lib/tax/spt-read-model"
import { buildTaxLiability } from "@/lib/tax/tax-liability"
import { isValidVendorTaxInvoiceNumber } from "@/lib/tax/tax-invoice"
import { returnDeductionPeriod } from "@/lib/tax/return-snapshot"
import { safeSubtract } from "@/lib/utils/math"

export interface SptPeriodRow {
  period: string
  outputVat: number
  returnVat: number
  inputVat: number
  net: number
  kurangBayar: boolean
  /** Sumber baris keluaran/masukan pada masa ini. */
  source: "tax_invoice" | "legacy" | "mixed"
  journalLiability: number | null
  /** Kewajiban jurnal − posisi SPT; null bila akun PPN belum dipetakan. */
  journalVsSptDiff: number | null
  paid: number
  balance: number
  overpaid: boolean
}

function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function monthRange(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number)
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) }
}

export async function loadSptPeriodRows(): Promise<SptPeriodRow[]> {
  return loadSptPeriodRowsForRange()
}

/** Batasi read-model SPT ke rentang tanggal inklusif (untuk laporan per periode). */
export async function loadSptPeriodRowsForRange(range?: {
  start: Date
  end: Date
}): Promise<SptPeriodRow[]> {
  // Akun PPN belum dipetakan di pengaturan = kewajiban jurnal null (selisih
  // tampil "-"), bukan gagal total: posisi dokumen tetap wajib tampil.
  let settings: Awaited<ReturnType<typeof getSystemSettings>> | null = null
  try {
    settings = await getSystemSettings()
  } catch {
    settings = null
  }
  const outputAccountId = settings?.salesTaxAccountId ?? null
  const inputAccountId = settings?.purchaseTaxAccountId ?? null

  const [taxInvoices, salesInvoices, vendorBills, salesReturns, journalEntries, taxPayments] =
    await Promise.all([
      prisma.taxInvoice.findMany({
        select: {
          id: true,
          direction: true,
          taxPeriod: true,
          creditPeriod: true,
          creditStatus: true,
          dpp: true,
          taxAmount: true,
          djpStatus: true,
          creditablePercent: true,
          salesInvoiceId: true,
          vendorBillId: true,
          replacesId: true,
        },
        orderBy: { id: "asc" },
      }),
      prisma.salesInvoice.findMany({
        where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null, taxAmount: { gt: 0 } },
        select: { id: true, date: true, subtotal: true, discount: true, taxAmount: true },
      }),
      prisma.vendorBill.findMany({
        where: { status: { in: ["posted", "partial", "paid"] }, deletedAt: null, tax: { gt: 0 } },
        select: { id: true, date: true, subtotal: true, discountAmount: true, tax: true, taxInvoiceNumber: true },
      }),
      prisma.salesReturn.findMany({
        where: { status: "completed" },
        select: {
          date: true,
          taxReturnNoteDate: true,
          items: { select: { returnDpp: true, returnVat: true } },
        },
      }),
      outputAccountId || inputAccountId
        ? prisma.journalEntry.findMany({
            where: {
              accountId: { in: [outputAccountId, inputAccountId].filter((v): v is number => v != null) },
              journal: {
                status: { in: [...REPORT_JOURNAL_STATUSES] },
                deletedAt: null,
              },
            },
            select: {
              accountId: true,
              debit: true,
              credit: true,
              journal: { select: { transactionDate: true } },
            },
          })
        : Promise.resolve([]),
      prisma.taxPayment.findMany({
        where: { deletedAt: null },
        select: { period: true, amount: true, taxKind: true },
      }),
    ])

  // Rantai keluaran: kelompokkan per akar (faktur tanpa replacesId).
  const byId = new Map(taxInvoices.map((t) => [t.id, t]))
  const chains: OutputChain[] = []
  for (const inv of taxInvoices) {
    if (inv.direction !== "out" || inv.replacesId != null) continue
    const chain = [inv]
    let cursor = inv
    for (;;) {
      const next = taxInvoices.find((t) => t.replacesId === cursor.id)
      if (!next) break
      chain.push(next)
      cursor = next
    }
    void byId
    chains.push({
      originPeriod: inv.taxPeriod,
      chain: chain.map((c) => ({
        id: c.id,
        djpStatus: c.djpStatus,
        dpp: Number(c.dpp),
        taxAmount: Number(c.taxAmount),
      })),
    })
  }

  const outputRows = buildOutputSptRows(chains)
  const inputRows = buildInputSptRows(
    taxInvoices
      .filter((t) => t.direction === "in")
      .map((t) => ({
        taxPeriod: t.taxPeriod,
        creditPeriod: t.creditPeriod,
        creditStatus: t.creditStatus,
        dpp: Number(t.dpp),
        taxAmount: Number(t.taxAmount),
        djpStatus: t.djpStatus,
        creditablePercent: Number(t.creditablePercent),
      })),
  )

  // Fallback legacy PER DOKUMEN: dokumen komersial yang sudah punya
  // TaxInvoice (status apa pun) tidak dihitung ulang sebagai legacy —
  // yang belum punya tetap tampil walau masanya sudah punya TaxInvoice.
  const coveredSalesIds = new Set(
    taxInvoices.filter((t) => t.direction === "out" && t.salesInvoiceId != null).map((t) => t.salesInvoiceId),
  )
  const coveredBillIds = new Set(
    taxInvoices.filter((t) => t.direction === "in" && t.vendorBillId != null).map((t) => t.vendorBillId),
  )
  const legacyOut = new Map<string, { dpp: number; vat: number; count: number }>()
  for (const inv of salesInvoices) {
    if (coveredSalesIds.has(inv.id)) continue
    const p = periodOf(inv.date)
    const row = legacyOut.get(p) ?? { dpp: 0, vat: 0, count: 0 }
    row.dpp += Number(inv.subtotal) - Number(inv.discount)
    row.vat += Number(inv.taxAmount)
    row.count += 1
    legacyOut.set(p, row)
  }
  const legacyIn = new Map<string, { dpp: number; vat: number; count: number }>()
  for (const bill of vendorBills) {
    if (coveredBillIds.has(bill.id)) continue
    // F-2026-10-28-157-V Putusan 2: bill tax>0 tanpa nomor valid TIDAK ADA
    // kaki PPN di jurnal (gabung HPP) — read-model SPT memperlakukannya
    // TANPA PPN Masukan yang bisa dikreditkan, konsisten dengan jurnal.
    if (Number(bill.tax) > 0 && !isValidVendorTaxInvoiceNumber(bill.taxInvoiceNumber ?? null)) continue
    const p = periodOf(bill.date)
    const row = legacyIn.get(p) ?? { dpp: 0, vat: 0, count: 0 }
    row.dpp += Number(bill.subtotal) - Number(bill.discountAmount)
    row.vat += Number(bill.tax)
    row.count += 1
    legacyIn.set(p, row)
  }

  const mergedOut = withLegacyFallback(
    outputRows,
    [...legacyOut.entries()].map(([period, v]) => ({ period, ...v })),
  )
  const mergedIn = withLegacyFallback(
    inputRows,
    [...legacyIn.entries()].map(([period, v]) => ({ period, ...v })),
  )

  const deductionRows = buildReturnDeductionRows(
    salesReturns.flatMap((ret) =>
      ret.items.map((item) => ({
        period: returnDeductionPeriod(ret.date, ret.taxReturnNoteDate),
        dpp: item.returnDpp == null ? 0 : Number(item.returnDpp),
        vat: item.returnVat == null ? 0 : Number(item.returnVat),
        snapshot: item.returnDpp != null && item.returnVat != null,
      })),
    ),
  ).byPeriod

  // Kewajiban jurnal per masa: bucket per (akun, masa jurnal).
  const journalLegs: { bucket: string; debit: number; credit: number }[] = []
  for (const e of journalEntries) {
    const side = e.accountId === outputAccountId ? "ppn_out" : "ppn_in"
    journalLegs.push({
      bucket: `${side}:${periodOf(e.journal.transactionDate)}`,
      debit: Number(e.debit),
      credit: Number(e.credit),
    })
  }
  const liability = buildTaxLiability({
    journalLegs,
    payments: taxPayments
      .filter((p) => p.period && (p.taxKind === "ppn" || p.taxKind == null))
      .map((p) => ({ bucket: `ppn:${p.period}`, amount: Number(p.amount) })),
  })

  const periods = new Set<string>([
    ...mergedOut.map((r) => r.period),
    ...mergedIn.map((r) => r.period),
    ...deductionRows.map((r) => r.period),
    ...liability.rows.map((r) => r.bucket.split(":")[1]).filter(Boolean),
  ])

  const outBy = new Map(mergedOut.map((r) => [r.period, r]))
  const inBy = new Map(mergedIn.map((r) => [r.period, r]))
  const dedBy = new Map(deductionRows.map((r) => [r.period, r]))
  const paidBy = new Map(
    liability.rows
      .filter((r) => r.bucket.startsWith("ppn:"))
      .map((r) => [r.bucket.slice(4), r]),
  )

  const rows: SptPeriodRow[] = [...periods].sort((a, b) => a.localeCompare(b)).map((period) => {
    const out = outBy.get(period)
    const inp = inBy.get(period)
    const ded = dedBy.get(period)
    const { start, end } = monthRange(period)
    void start
    void end
    const outputVat = out?.vat ?? 0
    const inputVat = inp?.vat ?? 0
    const returnVat = ded?.vat ?? 0
    const position = netVatForPeriod({ outputVat, returnVat, inputVat })
    const outLegs = journalLegs.filter((l) => l.bucket === `ppn_out:${period}`)
    const inLegs = journalLegs.filter((l) => l.bucket === `ppn_in:${period}`)
    const journalLiability =
      outputAccountId == null && inputAccountId == null
        ? null
        : safeSubtract(
            outLegs.reduce((s, l) => s + (l.credit - l.debit), 0),
            inLegs.reduce((s, l) => s + (l.debit - l.credit), 0),
            2,
          )
    const paid = paidBy.get(period)
    return {
      period,
      outputVat,
      returnVat,
      inputVat,
      net: position.net,
      kurangBayar: position.kurangBayar,
      source: (() => {
        const sources = [out?.source, inp?.source].filter(Boolean)
        const hasLegacy = sources.some((s) => s === "legacy" || s === "mixed")
        const hasTax = sources.some((s) => s === "tax_invoice" || s === "mixed")
        return hasLegacy && hasTax ? "mixed" : hasLegacy ? "legacy" : "tax_invoice"
      })(),
      journalLiability,
      journalVsSptDiff:
        journalLiability == null ? null : safeSubtract(journalLiability, position.net, 2),
      paid: paid?.paid ?? 0,
      balance: safeSubtract(position.net, paid?.paid ?? 0, 2),
      overpaid: safeSubtract(position.net, paid?.paid ?? 0, 2) < 0,
    }
  })

  if (!range) return rows
  const startPeriod = periodOf(range.start)
  const endPeriod = periodOf(range.end)
  return rows.filter((r) => r.period >= startPeriod && r.period <= endPeriod)
}
