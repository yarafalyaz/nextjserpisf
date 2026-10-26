/**
 * Loader read-only antrean Pesanan Pembelian draft mengendap
 * (F-2026-10-26-060-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Izin `view_purchase_orders` ditegakkan DI SINI fail-closed sebelum
 * query apa pun (spec §2: tanpa key baru); halaman pemanggil
 * menegakkannya juga sebelum loader. Tanpa izin: nol baris bocor
 * (AC-POQ-B5). PurchaseOrder tidak punya scope gudang (schema tanpa
 * warehouseId) — tidak ada scope tambahan yang ditegakkan tahap ini.
 *
 * Populasi query persis BR-POQ-01: PurchaseOrder `status: "draft"` +
 * `deletedAt: null`; builder menyaring ulang lapis kedua. Anti-N+1:
 * satu query PurchaseOrder (+vendor/PR/WO) + satu query User massal
 * nama pembuat — bukan query per baris. Select daftar-putih TANPA
 * kontak vendor (BR-POQ-08: nama saja, tanpa phone/email/address).
 * Baca-saja mutlak (BR-POQ-07): loader hanya `findMany`; persetujuan,
 * batal, hapus tetap dari detail PO jalur existing. GrandTotal verbatim
 * tersimpan (Decimal->Number di tepi; rekap berlabel "nilai draft
 * belum disetujui", BR-POQ-03).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildPurchaseOrderDraftQueue,
  type PurchaseOrderDraftInput,
  type PurchaseOrderDraftQueue,
} from "@/lib/reports/purchase-order-draft-queue"

export interface PurchaseOrderDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getPurchaseOrderDraftQueue(
  options: PurchaseOrderDraftQueueOptions = {},
): Promise<PurchaseOrderDraftQueue> {
  await requirePermission("view_purchase_orders")

  const orders = await prisma.purchaseOrder.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      vendorId: true,
      purchaseRequestId: true,
      workOrderId: true,
      isService: true,
      date: true,
      expectedDate: true,
      createdBy: true,
      createdAt: true,
      grandTotal: true,
      vendor: { select: { name: true } },
      purchaseRequest: { select: { documentNo: true } },
      workOrder: { select: { documentNo: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const creatorIds = [
    ...new Set(orders.map((o) => o.createdBy).filter((id): id is number => id != null)),
  ]
  const creators =
    creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        })
      : []
  const creatorNameById = new Map(creators.map((u) => [u.id, u.name]))

  const inputs: PurchaseOrderDraftInput[] = orders.map((o) => ({
    purchaseOrderId: o.id,
    slug: o.slug,
    documentNo: o.documentNo,
    status: o.status,
    deletedAt: o.deletedAt,
    vendorId: o.vendorId,
    vendorName: o.vendor?.name ?? null,
    purchaseRequestId: o.purchaseRequestId,
    purchaseRequestDocumentNo: o.purchaseRequest?.documentNo ?? null,
    workOrderId: o.workOrderId,
    workOrderDocumentNo: o.workOrder?.documentNo ?? null,
    isService: o.isService,
    date: o.date,
    expectedDate: o.expectedDate,
    createdByName: o.createdBy != null ? (creatorNameById.get(o.createdBy) ?? null) : null,
    createdAt: o.createdAt,
    grandTotal: Number(o.grandTotal),
  }))

  return buildPurchaseOrderDraftQueue(inputs, options.now ?? new Date())
}
