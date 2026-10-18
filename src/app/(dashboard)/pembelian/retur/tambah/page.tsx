export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseReturnForm } from "@/components/forms/purchase-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Retur" }

export default async function CreatePurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ poId?: string }>
}) {
  await requirePermission("create_purchase_returns")

  const params = await searchParams
  const preselectedPoId = params.poId ? Number(params.poId) : null

  const [purchaseOrders, items, preselectedPo] = await Promise.all([
    prisma.purchaseOrder.findMany({
      // `partial_received` ikut ditawarkan: PO yang baru sebagian datang tetap
      // bisa diretur, dan tanpa status ini PO hasil tombol "Buat Retur" tidak
      // pernah muncul di pemilihnya.
      where: {
        status: { in: ["received", "partial_received", "verified", "completed", "ordered"] },
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true },
    }),
    // Sumber "Buat Retur dari PO": PO yang dituju bisa berstatus di luar daftar di
    // atas (mis. draft/rejected yang punya penerimaan), jadi ia diambil terpisah
    // dan ditambahkan ke daftar pilihan supaya Combobox-nya tidak kosong.
    preselectedPoId
      ? prisma.purchaseOrder.findFirst({
          where: { id: preselectedPoId, deletedAt: null },
          select: {
            id: true,
            documentNo: true,
            items: {
              orderBy: { id: "asc" },
              select: { itemId: true, qty: true, receivedQty: true },
            },
          },
        })
      : null,
  ])

  const poOptions =
    preselectedPo && !purchaseOrders.some((po) => po.id === preselectedPo.id)
      ? [{ id: preselectedPo.id, documentNo: preselectedPo.documentNo }, ...purchaseOrders]
      : purchaseOrders

  // Prefill baris retur dari qty yang SUDAH DITERIMA (bukan qty dipesan): barang
  // yang belum datang tidak bisa dikembalikan ke vendor. `receivedQty` diisi hook
  // penerimaan barang (goods-receipt.hook) sejak perbaikan akumulator PO, dan
  // penjagaan over-return di createPurchaseReturn memakai angka yang sama.
  const receivedLines = preselectedPo
    ? preselectedPo.items
        .filter((line) => Number(line.receivedQty) > 0)
        .map((line) => ({ itemId: line.itemId, qty: Number(line.receivedQty) }))
    : []

  const returnPrefill = preselectedPo
    ? {
        id: 0,
        purchaseOrderId: preselectedPo.id,
        date: "",
        items: receivedLines,
      }
    : undefined

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Pembelian", href: "/pembelian" },
  { label: "Retur", href: "/pembelian/retur" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Retur Pembelian</h1>
      </div>
      <PurchaseReturnForm purchaseOrders={poOptions} items={items} returnData={returnPrefill} />
    </div>
  )
}
