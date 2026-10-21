export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Perintah Produksi" }

/**
 * Jalur "buat dari": segmen `perintah-kerja/<slug>` (plus `produk/<slug>`
 * bila produk jadinya sudah jelas) — dipakai tombol "+ Perintah Produksi"
 * di detail Perintah Kerja. Tanpa ini satu-satunya cara membuat order
 * adalah form manual tanpa input WO, sehingga `ProductionOrder.workOrderId`
 * selalu null dan backlink WO serta laporan Job Order ikut kosong.
 */
const woHref = (slug: string) => `/produksi/production-orders/tambah/perintah-kerja/${slug}`
const productHref = (slug: string) => `/produksi/production-orders/tambah/produk/${slug}`

export default async function CreateProductionOrderPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ workOrderId?: string; productId?: string }>
}) {
  await requirePermission("create_production_orders")

  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["perintah-kerja", "produk"])

  // Tautan lama `?workOrderId=`/`?productId=` → bentuk path.
  if (!seg["perintah-kerja"] && !seg.produk) {
    if (params.workOrderId !== undefined && params.productId !== undefined) {
      const woId = Number(params.workOrderId)
      const productId = Number(params.productId)
      const [wo, product] = await Promise.all([
        Number.isInteger(woId) && woId > 0
          ? prisma.workOrder.findUnique({ where: { id: woId }, select: { slug: true } })
          : null,
        Number.isInteger(productId) && productId > 0
          ? prisma.product.findUnique({ where: { id: productId }, select: { slug: true } })
          : null,
      ])
      if (wo?.slug && product?.slug) {
        redirect(`${woHref(wo.slug)}/produk/${product.slug}`)
      }
    }
    if (params.workOrderId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.workOrder, params.workOrderId, woHref, "/produksi/production-orders/tambah")
    }
    if (params.productId !== undefined) {
      await redirectLegacyPrefillQuery(prisma.product, params.productId, productHref, "/produksi/production-orders/tambah")
    }
  }
  const defaultWorkOrderId = seg["perintah-kerja"]
    ? await resolvePrefillId(prisma.workOrder, seg["perintah-kerja"], woHref)
    : null
  const requestedProductId = seg.produk
    ? await resolvePrefillId(prisma.product, seg.produk, productHref)
    : null

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
