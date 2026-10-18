export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Perintah Produksi" }

/**
 * Jalur "buat dari": `/produksi/production-orders/tambah?workOrderId=N` (plus
 * `&productId=M` bila produk jadinya sudah jelas) — dipakai tombol
 * "+ Perintah Produksi" di detail Perintah Kerja. Tanpa ini satu-satunya cara
 * membuat order adalah form manual tanpa input WO, sehingga
 * `ProductionOrder.workOrderId` selalu null dan backlink WO serta laporan Job
 * Order ikut kosong.
 */
const positiveId = (raw: string | undefined): number | null => {
  if (!raw) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export default async function CreateProductionOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ workOrderId?: string; productId?: string }>
}) {
  await requirePermission("create_production_orders")

  const { workOrderId, productId } = await searchParams
  const defaultWorkOrderId = positiveId(workOrderId)
  const requestedProductId = positiveId(productId)

  const [products, workOrders] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true },
    }),
    prisma.workOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, documentNo: true },
    }),
  ])

  // WO/produk yang diminta lewat URL wajib tetap bisa dipilih walau di luar 500
  // terbaru — kalau tidak, tautannya tampak kosong di form dan tersimpan null.
  const [linkedWorkOrder, linkedProduct] = await Promise.all([
    defaultWorkOrderId && !workOrders.some((wo) => wo.id === defaultWorkOrderId)
      ? prisma.workOrder.findUnique({
          where: { id: defaultWorkOrderId },
          select: { id: true, documentNo: true },
        })
      : null,
    requestedProductId && !products.some((p) => p.id === requestedProductId)
      ? prisma.product.findUnique({
          where: { id: requestedProductId },
          select: { id: true, name: true, sku: true },
        })
      : null,
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Perintah Produksi</h1>
      </div>
      <ProductionOrderForm
        products={linkedProduct ? [linkedProduct, ...products] : products}
        workOrders={linkedWorkOrder ? [linkedWorkOrder, ...workOrders] : workOrders}
        defaultWorkOrderId={defaultWorkOrderId}
        defaultProductId={requestedProductId}
      />
    </div>
  )
}
