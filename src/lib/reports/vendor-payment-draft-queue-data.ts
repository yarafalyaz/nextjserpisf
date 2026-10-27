/**
 * Loader read-only antrean pembayaran vendor draft mengendap
 * (F-2026-10-26-072-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (BR-VPQ-05): izin `view_vendor_payments`
 * ditegakkan di sini. TIDAK ada scope gudang/departemen untuk
 * pembayaran vendor di kode existing — jangan karang (Q-VPQ-4
 * tertanam: tanpa pembatasan per pembuat tahap 1).
 *
 * Populasi persis `status: "draft"` + `deletedAt: null` (BR-VPQ-01);
 * builder menyaring ulang lapis kedua. Anti-N+1: satu query
 * VendorPayment (+relasi vendor/tagihan tujuan) + satu query User
 * massal nama pembuat — BUKAN query per baris (AC-VPQ-B4). Select
 * daftar-putih TANPA adminFee (BR-VPQ-04): biaya bank baru lahir
 * saat jurnal konfirmasi. Decimal→Number di tepi loader.
 *
 * Baca-saja mutlak (BR-VPQ-08, AC-VPQ-B5): loader hanya `findMany`;
 * tidak memanggil confirmVendorPayment/update/delete/hook jurnal.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildVendorPaymentDraftQueue,
  type VendorPaymentDraftInput,
  type VendorPaymentDraftQueue,
} from "@/lib/reports/vendor-payment-draft-queue"

export interface VendorPaymentDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getVendorPaymentDraftQueue(
  options: VendorPaymentDraftQueueOptions = {},
): Promise<VendorPaymentDraftQueue> {
  await requirePermission("view_vendor_payments")

  const payments = await prisma.vendorPayment.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      vendorId: true,
      amount: true,
      paymentDate: true,
      vendorBillId: true,
      createdBy: true,
      createdAt: true,
      vendor: { select: { name: true } },
      vendorBill: { select: { documentNo: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const creatorIds = [
    ...new Set(payments.map((p) => p.createdBy).filter((id): id is number => id != null)),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : []
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]))

  const inputs: VendorPaymentDraftInput[] = payments.map((p) => ({
    vendorPaymentId: p.id,
    slug: p.slug,
    documentNo: p.documentNo,
    status: p.status,
    deletedAt: p.deletedAt,
    vendorId: p.vendorId,
    vendorName: p.vendor.name,
    amount: Number(p.amount),
    paymentDate: p.paymentDate,
    vendorBillId: p.vendorBillId,
    vendorBillDocumentNo: p.vendorBill?.documentNo ?? null,
    createdByName: p.createdBy != null ? (creatorNameById.get(p.createdBy) ?? null) : null,
    createdAt: p.createdAt,
  }))

  return buildVendorPaymentDraftQueue(inputs, options.now ?? new Date())
}
