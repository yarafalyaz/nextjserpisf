/**
 * F-2026-10-25-036-S (BLOCKER-1 QA): pembekuan snapshot tarif komisi saat
 * faktur mencapai lunas lewat jalur yang TIDAK melewati recalcCore
 * (konversi DP, DP lanjutan, alokasi kredit pelanggan).
 *
 * Aturan sama persis dengan snapshot di recalcCore (BR-KT36-04): resolusi
 * histori tarif per TANGGAL FAKTUR dari kategori pelanggan saat itu;
 * snapshot yang sudah ada tidak pernah ditulis ulang; tarif tak ditemukan
 * = 0 tertulis supaya tarif yang dibuat mundur tidak mengisi faktur lama
 * (BR-KT36-13). Pemanggil wajib meneruskan kondisi transisi: fungsi ini
 * mengembalikan {} (tanpa snapshot) bila faktur tidak bertransisi ke paid
 * atau snapshot sudah terisi.
 */
import { Prisma } from "@prisma/client"

import { resolveCommissionRate } from "@/lib/services/customer-commission-rate.service"

type Db = Prisma.TransactionClient

interface SnapshotInvoice {
  id: number
  customerId: number
  date: Date
  commissionRatePercent: number | Prisma.Decimal | null
}

/**
 * Fragment `data` snapshot untuk ditulis BERSAMA update paidAmount/
 * paymentStatus pemanggil, dalam transaksi yang sama. Bukan paid
 * (paymentStatus target bukan "paid") atau snapshot sudah ada -> {}.
 */
export async function commissionSnapshotForPaid(
  db: Db,
  invoice: SnapshotInvoice,
  goingPaid: boolean,
): Promise<{
  commissionRatePercent?: Prisma.Decimal
  commissionCustomerCategoryId?: number | null
  commissionRateId?: number | null
}> {
  if (!goingPaid) return {}
  if (invoice.commissionRatePercent !== null && invoice.commissionRatePercent !== undefined) return {}

  const customer = await db.customer.findUnique({
    where: { id: invoice.customerId },
    select: { customerCategoryId: true },
  })
  const rates = await db.customerCommissionRate.findMany({
    where: { customerCategoryId: customer?.customerCategoryId ?? -1 },
    select: { id: true, customerCategoryId: true, commissionPercent: true, effectiveFrom: true, effectiveTo: true },
  })
  const resolved = resolveCommissionRate(
    rates.map((r) => ({ ...r, commissionPercent: Number(r.commissionPercent) })),
    customer?.customerCategoryId ?? null,
    invoice.date,
  )
  return {
    commissionRatePercent: new Prisma.Decimal(resolved.commissionPercent.toFixed(2)),
    commissionCustomerCategoryId: resolved.customerCategoryId,
    commissionRateId: resolved.rateId,
  }
}
