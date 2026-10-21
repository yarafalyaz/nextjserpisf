export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesOrderForm } from "@/components/forms/sales-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  parsePrefillSegments,
  redirectLegacyPrefillQuery,
  resolvePrefillId,
} from "@/lib/utils/prefill-path"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pesanan" }

const quotationHref = (slug: string) => `/penjualan/pesanan/tambah/penawaran/${slug}`

export default async function CreateSalesOrderPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ quotationId?: string }>
}) {
  await requirePermission("create_sales_orders")
  const params = await searchParams
  const { segments } = await routeParams
  const seg = parsePrefillSegments(segments, ["penawaran"])

  // Tautan lama `?quotationId=` → bentuk path `penawaran/<slug>`.
  if (!seg.penawaran && params.quotationId !== undefined) {
    await redirectLegacyPrefillQuery(prisma.quotation, params.quotationId, quotationHref, "/penjualan/pesanan/tambah")
  }
  const quotationId = seg.penawaran
    ? await resolvePrefillId(prisma.quotation, seg.penawaran, quotationHref)
    : undefined

  const [customers] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  // Pre-fill from quotation if provided
  let quotation = null
  if (quotationId) {
    quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { sections: { include: { items: true } }, customer: true },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{ label: "Pesanan Penjualan", href: "/penjualan/pesanan" },{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Pesanan Penjualan</h1>
      </div>
      <SalesOrderForm
        customers={customers}
        quotationId={quotationId}
        defaultCustomerId={quotation?.customerId}
      />
    </div>
  )
}
