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

  // Putaran 80: resolusi tarif wajib terserialisasi dengan penulis tarif
  // (create/update/delete CustomerCommissionRate mengunci baris kategori).
  // Kategori dibaca lewat locking read baris customer, lalu baris kategori
  // dikunci — bacaan polos di bawah terjadi sesudah kedua kunci.
  let lockedCategoryId: number | null | undefined
  if (typeof db.$queryRaw === "function") {
    const lockedCustomer = await db.$queryRaw<Array<{ customerCategoryId: number | null }>>`
      SELECT customerCategoryId FROM customers WHERE id = ${invoice.customerId} FOR UPDATE`
    if (Array.isArray(lockedCustomer)) {
      lockedCategoryId = lockedCustomer[0]?.customerCategoryId ?? null
      if (lockedCategoryId != null) {
        await db.$queryRaw`SELECT id FROM customer_categories WHERE id = ${lockedCategoryId} FOR UPDATE`
      }
    }
  }

  const customer = await db.customer.findUnique({
    where: { id: invoice.customerId },
    select: { customerCategoryId: true },
  })
  const categoryId = lockedCategoryId !== undefined ? lockedCategoryId : customer?.customerCategoryId
  const rates = await db.customerCommissionRate.findMany({
    where: { customerCategoryId: categoryId ?? -1 },
    select: { id: true, customerCategoryId: true, commissionPercent: true, effectiveFrom: true, effectiveTo: true },
  })
  const resolved = resolveCommissionRate(
    rates.map((r) => ({ ...r, commissionPercent: Number(r.commissionPercent) })),
    categoryId ?? null,
    invoice.date,
  )
  return {
    commissionRatePercent: new Prisma.Decimal(resolved.commissionPercent.toFixed(2)),
    commissionCustomerCategoryId: resolved.customerCategoryId,
    commissionRateId: resolved.rateId,
  }
}
