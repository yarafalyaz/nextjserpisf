import { afterAll, describe, expect, it } from "vitest"
import type { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"
import { computeTrialBalance } from "@/lib/finance/trial-balance"
import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import {
  buildTrialBalanceReport,
  type TrialBalanceReportInput,
} from "@/lib/reports/trial-balance-report"
import { loadTrialBalanceReport } from "@/lib/reports/trial-balance-data"
import { loadStockCard } from "@/lib/reports/stock-flow-data"
import { loadReceivablesAging } from "@/lib/reports/aging-reports-data"
import { asOfLabelOf } from "@/lib/reports/statement-data"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { formatAccountingExact, formatQuantity } from "@/lib/utils/format"

/**
 * Rekonsiliasi DB (putaran 248): builder laporan inti mengagregasi lewat satu
 * jalur Prisma (`sumEntriesByAccount`, `groupBy`, helper returnCredit) — tes
 * ini menghitung ulang angka yang sama lewat jalur SQL mentah yang berbeda
 * (`prisma.$queryRaw`) dan membandingkan tabel laporan secara penuh, jadi
 * drift agregasi, filter status, atau rumus sisa tidak bisa menyelinap.
 *
 * Murni READ-ONLY: tidak ada create/delete, sehingga aman dijalankan terhadap
 * DB dev yang dirawat tangan (berbeda dari suite integration yang memakai
 * fixture buang-pakai). Gate tetap `RUN_DB_INTEGRATION=1`; tanpa itu suite
 * ini skip di unit run biasa.
 *
 * Pemeriksaan:
 *  1. Neraca saldo — tabel identik jalur SQL mentah + computeTrialBalance,
 *     invarian debit=kredit, dan tidak ada akun nonaktif ber-saldo.
 *  2. Kartu stok — Saldo Akhir baris kartu == aritmetika stock_moves dan
 *     == sisa inventory_layers (dua tabel berbeda yang wajib setuju).
 *  3. Umur piutang — multiset baris rincian == derivasi
 *     `sisa = grand_total − paid_amount − returnCredit(jurnal SalesReturn
 *     POSTED ke akun Piutang)` sesuai tampungan `sisa > Rp1`.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

const PERIOD_ALL = {
  start: new Date("1970-01-01T00:00:00+07:00"),
  end: new Date("2100-01-01T00:00:00+07:00"),
} as const

/** Saldo periode terjauh (mencakup seluruh mutasi riwayat DB). */
const AS_OF = new Date("2100-01-01T00:00:00+07:00")

/** Penjumlahan skala-sen presisi (persis diskrit safeAdd builder). */
function round2(total: number, delta: number): number {
  const summed = Math.abs(total + delta) < 0.005 ? 0 : total + delta
  return Math.round(summed * 100) / 100
}

describe.skipIf(SKIP)("rekonsiliasi laporan inti vs SQL mentah (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("neraca saldo: tabel laporan identik dengan jalur $queryRaw + computeTrialBalance", async () => {
    // Jalur 1 — kode produksi (Prisma groupBy lewat loader).
    const report = await loadTrialBalanceReport(AS_OF, null)

    // Jalur 2 — SQL mentah per akun: status POSTED/REVERSED, jurnal tidak
    // terhapus, akun aktif. Definisi yang sama, teknisi yang berbeda.
    const rawRows = await prisma.$queryRaw<
      Array<{
        account_id: number
        code: string
        name: string
        type: string
        debit: Prisma.Decimal
        credit: Prisma.Decimal
      }>
    >`
      SELECT je.account_id, a.code, a.name, a.type,
             SUM(je.debit) AS debit, SUM(je.credit) AS credit
      FROM journal_entries je
      JOIN journals j ON j.id = je.journal_id
                      AND j.deleted_at IS NULL
                      AND j.status IN ('POSTED', 'REVERSED')
      JOIN accounts a ON a.id = je.account_id AND a.is_active = 1
      GROUP BY je.account_id, a.code, a.name, a.type
      HAVING SUM(je.debit) <> 0 OR SUM(je.credit) <> 0
    `

    // Benteng: akun NONAKTIF yang masih membawa saldo = uang yang tidak akan
    // muncul di laporan mana pun. Dataset di DB dev wajib bersih.
    const inactiveWithBalance = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT a.id FROM journal_entries je
      JOIN journals j ON j.id = je.journal_id
                      AND j.deleted_at IS NULL
                      AND j.status IN ('POSTED', 'REVERSED')
      JOIN accounts a ON a.id = je.account_id AND a.is_active = 0
      GROUP BY a.id
      HAVING SUM(je.debit) <> SUM(je.credit)
    `
    expect(inactiveWithBalance).toHaveLength(0)

    const mirror = computeTrialBalance(
      rawRows.map((row) => ({
        id: row.account_id,
        code: row.code,
        name: row.name,
        type: row.type,
        totalDebit: Number(row.debit),
        totalCredit: Number(row.credit),
      })),
    )

    const expected = buildTrialBalanceReport({
      lines: mirror.lines,
      grandTotalDebit: mirror.grandTotalDebit,
      grandTotalCredit: mirror.grandTotalCredit,
      isBalanced: mirror.isBalanced,
      asOfLabel: asOfLabelOf(AS_OF),
      comparison: null,
    } as TrialBalanceReportInput)

    expect(report.table).toEqual(expected.table)

    // Invarian inti: seluruh data yang dijawab laporan wajib seimbang.
    if (mirror.lines.length > 0) {
      expect(mirror.isBalanced).toBe(true)
      expect(Math.abs(mirror.grandTotalCredit - mirror.grandTotalDebit)).toBeLessThan(0.01)
    }
  })

  it("kartu stok: Saldo Akhir kartu == aritmetika stock_moves dan == sisa inventory_layers", async () => {
    const [layerRows, moves] = await Promise.all([
      prisma.inventoryLayer.groupBy({
        by: ["itemId", "warehouseId"],
        where: { remaining: { gt: 0 } },
        _sum: { remaining: true },
      }),
      prisma.stockMove.findMany({
        where: { status: "posted" },
        select: { itemId: true, impact: true, qty: true },
      }),
    ])

    const items = [...new Set([...layerRows.map((l) => l.itemId), ...moves.map((m) => m.itemId)])]
    for (const itemId of items) {
      const report = await loadStockCard(PERIOD_ALL, itemId, null)
      const dataRows = report.table.rows.filter((row) => row.kind === "data")
      const last = dataRows.at(-1) as { cells?: string[] }

      // Baris terakhir kartu selalu baris Saldo Akhir (baris bold).
      expect(last.cells?.[1]).toBe("Saldo Akhir")

      // Aritmetika gerakan (opening kosong bila periode penuh; builder
      // memperlakukan impact non-IN sebagai pengurang).
      const itemMoves = moves.filter((move) => move.itemId === itemId)
      const movementQty = itemMoves.reduce((agg, m) => {
        return m.impact === "IN" ? round2(agg, Number(m.qty)) : round2(agg, -Number(m.qty))
      }, 0)

      expect(last.cells?.[6]).toBe(formatQuantity(movementQty))

      // Dua tabel berbeda wajib setuju: lapisan tersisa vs gerakan bersih.
      const layerRemaining = layerRows
        .filter((layer) => layer.itemId === itemId)
        .reduce((sum, layer) => round2(sum, Number(layer._sum.remaining ?? 0)), 0)
      expect(last.cells?.[6]).toBe(formatQuantity(layerRemaining))
    }
  })

  it("umur piutang: baris rincian identik dengan derivasi $queryRaw (sisa–paid–retur)", async () => {
    const report = await loadReceivablesAging(AS_OF)

    const settings = await prisma.systemSetting.findFirst({
      select: { salesReceivableAccountId: true },
    })
    const receivableAccountId = settings?.salesReceivableAccountId ?? null

    const rawInvoices = await prisma.$queryRaw<
      Array<{
        id: number
        grand_total: Prisma.Decimal
        paid_amount: Prisma.Decimal
        document_no: string | null
      }>
    >`
      SELECT id, grand_total, paid_amount, document_no
      FROM sales_invoices
      WHERE deleted_at IS NULL
        AND due_date IS NOT NULL
        AND date <= ${AS_OF}
        AND status IN ('posted', 'partial', 'paid')
    `

    // Mirror loadReturnCreditByInvoiceId dengan jalur berbeda: kaki Cr
    // Piutang pada jurnal SalesReturn POSTED retur completed. Retur tanpa
    // jurnal POSTED tidak dihitung (sama dengan inti).
    const creditRows = receivableAccountId
      ? await prisma.$queryRaw<Array<{ invoice_id: number; credit: Prisma.Decimal }>>`
          SELECT sr.sales_invoice_id AS invoice_id, SUM(je.credit) AS credit
          FROM sales_returns sr
          JOIN journals j ON j.reference_type = 'SalesReturn' AND j.reference_id = sr.id
                          AND j.status = 'POSTED' AND j.deleted_at IS NULL
          JOIN journal_entries je ON je.journal_id = j.id
                                  AND je.account_id = ${receivableAccountId}
          WHERE sr.status = 'completed' AND sr.sales_invoice_id IS NOT NULL
          GROUP BY sr.sales_invoice_id
        `
      : []
    const creditByInvoiceId = new Map(
      creditRows.map((row) => [row.invoice_id, Number(row.credit)]),
    )

    const mirror = rawInvoices
      .map((inv) => {
        const outstanding = round2(
          Number(inv.grand_total) - Number(inv.paid_amount) - (creditByInvoiceId.get(inv.id) ?? 0),
          0,
        )
        if (isOutstandingSettled(outstanding)) return null
        return {
          documentNo: salesInvoiceLabel({
            id: inv.id,
            documentNo: inv.document_no,
          }),
          money: formatAccountingExact(outstanding, { zeroDash: false }),
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    // Rincian = baris data dengan tanggal di kolom ke-3 (baris ringkasan
    // bucket meninggalkan kolom 3 kosong). Urutan laporan menurun per sisa;
    // bandingkan sebagai multiset pasangan (dokumen, sisa) agar ordenya
    // tidak menggiring hasil.
    const rincianRows = (report.table.rows as Array<{ kind: string; cells?: string[] }>)
      .filter((row) => row.kind === "data" && row.cells?.[2] !== "")
      .map((row) => ({ documentNo: row.cells?.[1], money: row.cells?.[4] }))
      .sort((a, b) => (a.documentNo ?? "").localeCompare(b.documentNo ?? ""))
    const mirrorRows = mirror
      .map((row) => ({ documentNo: row.documentNo, money: row.money }))
      .sort((a, b) => a.documentNo.localeCompare(b.documentNo))

    expect(rincianRows).toEqual(mirrorRows)
  })
})
