export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Production Orders" }

export default async function CreateProductionOrderPage() {
  await requirePermission("create_production_orders")

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Perintah Produksi</h1>
      </div>
      <ProductionOrderForm products={products} />
    </div>
  )
}
