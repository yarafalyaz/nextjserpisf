/**
 * Loader read-only rekap komisi informatif (F-2026-10-21-016 tahap 2,
 * tarif nyata F-2026-10-25-036-S).
 *
 * Dua query massal tanpa N+1: (1) faktur LUNAS (status `paid`, belum
 * terhapus) dalam periode tanggal faktur lengkap snapshot penjual + tarif
 * komisinya; (2) retur completed dalam periode TANGGAL RETUR tertaut
 * faktur asal LUNAS dan hidup — pengurang diakui di masa retur
 * (BR-KT36-07), teratribusi lewat snapshot faktur asal (penjual +
 * persen), yang dimuat terpisah bila faktur asal di luar periode faktur.
 * Retur yang faktur asalnya tidak pernah lunas dibuang: komisinya tidak
 * pernah diakui, jadi tidak ada yang boleh dikurangi.
 *
 * Persen dibaca dari snapshot `commissionRatePercent` faktur (beku saat
 * transisi paid, resolusi per tanggal faktur); faktur lama tanpa snapshot
 * (null) diteruskan 0 jujur (BR-KT36-13) — DILARANG backfill dari histori
 * berjalan dan DILARANG menulis saat baca (AC-KT-6). Basis DPP diturunkan
 * builder: grandTotal − taxAmount snapshot faktur (BR-KT36-05).
 *
 * Baris retur legacy (returnDpp null): fallback Σ qty × price beku (F-004;
 * cost dilarang) — sama seperti snapshotReturnLine tanpa PPN; pengurang
 * komisi memang hanya memakai DPP.
 *
 * Read-only murni: tanpa mutasi/jurnal. Tahap 3 (utang komisi) tertutup.
 */

import { prisma } from "@/lib/db/prisma"
import { safeAdd, safeMultiply, safeRound } from "@/lib/utils/math"
import {
  buildSalesCommissionRecap,
  type SalesCommissionRecap,
  type SalesCommissionReturnInput,
} from "@/lib/reports/sales-commission"

export async function getSalesCommissionRecap(period: {
  start: Date
  end: Date
}): Promise<SalesCommissionRecap> {
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      deletedAt: null,
      status: "paid",
      date: { gte: period.start, lte: period.end },
    },
    select: {
      id: true,
      salesEmployeeId: true,
      grandTotal: true,
      taxAmount: true,
      commissionRatePercent: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  const periodReturns = await prisma.salesReturn.findMany({
    where: {
      status: "completed",
      date: { gte: period.start, lte: period.end },
      salesInvoiceId: { not: null },
      // Pengurang hanya atas komisi yang pernah diakui: faktur asal wajib
      // LUNAS dan hidup, sama seperti basis dan seperti kontrak loader
      // target penjualan. Tanpa saringan ini retur atas faktur
      // posted/partial (retur memang sah dari status itu) melahirkan
      // pengurang hantu — neto negatif tanpa basis. (Relasi SalesReturn→
      // faktur opsional, jadi saringan wajib di where induk, bukan di
      // select relasi yang hanya men-null-kan.)
      salesInvoice: { status: "paid", deletedAt: null },
    },
    select: {
      id: true,
      salesInvoiceId: true,
      items: { select: { qty: true, price: true, returnDpp: true } },
      salesInvoice: {
        select: {
          salesEmployeeId: true,
          commissionRatePercent: true,
          salesEmployee: { select: { name: true } },
        },
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  const returns: SalesCommissionReturnInput[] = periodReturns.map((ret) => ({
    salesEmployeeId: ret.salesInvoice?.salesEmployeeId ?? null,
    salesEmployeeName: ret.salesInvoice?.salesEmployee?.name ?? null,
    returnDppTotal: safeRound(
      ret.items.reduce(
        (sum, line) =>
          safeAdd(
            sum,
            line.returnDpp === null
              ? safeRound(safeMultiply(line.qty, line.price), 2)
              : Number(line.returnDpp),
            2,
          ),
        0,
      ),
      2,
    ),
    commissionPercent:
      ret.salesInvoice?.commissionRatePercent === null ||
      ret.salesInvoice?.commissionRatePercent === undefined
        ? 0
        : Number(ret.salesInvoice.commissionRatePercent),
  }))

  return buildSalesCommissionRecap(
    invoices.map((inv) => ({
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      grandTotal: Number(inv.grandTotal),
      taxAmount: Number(inv.taxAmount),
      commissionPercent:
        inv.commissionRatePercent === null ? 0 : Number(inv.commissionRatePercent),
    })),
    returns,
  )
}
