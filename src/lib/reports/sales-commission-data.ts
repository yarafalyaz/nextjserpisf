/**
 * Loader read-only rekap komisi informatif (F-2026-10-21-016 tahap 2).
 *
 * Satu query massal faktur LUNAS (status `paid`, belum terhapus) dalam
 * periode tanggal faktur, lengkap snapshot penjualnya — tanpa N+1.
 *
 * Persen komisi: belum ada setting persen per kategori pelanggan di schema
 * (CustomerCategory hanya punya downPaymentPercent), jadi loader meneruskan
 * 0 untuk semua baris — estimasi terbaca 0 dan label builder menyatakan
 * tarif belum diatur. JANGAN tebak tarif di sini.
 *
 * Bergantung kolom `salesEmployeeId` tahap 1 (PR #359) — branch ini
 * bertumpu di atas branch tahap 1. Read-only: tanpa migrasi/jurnal/mutasi.
 */

import { prisma } from "@/lib/db/prisma"
import { buildSalesCommissionRecap, type SalesCommissionRecap } from "@/lib/reports/sales-commission"

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
      salesEmployeeId: true,
      grandTotal: true,
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })

  return buildSalesCommissionRecap(
    invoices.map((inv) => ({
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      grandTotal: Number(inv.grandTotal),
      commissionPercent: 0,
    })),
  )
}
