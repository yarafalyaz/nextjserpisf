export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { PurchaseRequestForm } from "@/components/forms/purchase-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { parseMinStockPrefill } from "@/lib/reports/min-stock-request"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Permintaan Pembelian" }

export default async function CreatePurchaseRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>
}) {
  await requirePermission("create_purchase_requests")

  const [items, employees, vendors] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unitOfMeasure: true },
    }),
    prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  const { item: itemParam } = await searchParams
  const initialItems = parseMinStockPrefill(
    itemParam,
    new Set(items.map((item) => item.id)),
  )

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Pembelian",href:"/pembelian"},{label:"Permintaan",href:"/pembelian/permintaan"},{label:"Tambah"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Permintaan Pembelian</h1>
      </div>
      {initialItems.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {initialItems.length} barang terisi dari laporan stok minimum — periksa
          dan ubah jumlahnya sebelum menyimpan.
        </p>
      ) : null}
      <PurchaseRequestForm items={items} employees={employees} vendors={vendors} initialItems={initialItems} />
    </div>
  )
}
