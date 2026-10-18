export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ProductionOrderForm } from "@/components/forms/production-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Perintah Produksi" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_production_orders")

  const { slug } = await params

  const data = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.productionOrder.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.productionOrder.findUnique({ where: { id } }),
    },
  )

  if (!data) notFound()

  const order = {
    id: data.id,
    // Tautan WO dokumen ini (dulu di-hardcode 0) — form memakainya sebagai nilai
    // awal Combobox "Perintah Kerja"; 0/null berarti form tampil tanpa tautan dan
    // menyimpan null (menghapus tautan) saat disimpan.
    workOrderId: data.workOrderId,
    itemId: 0,
    productId: data.productId,
    qty: Number(data.qty),
    startDate: data.startDate?.toISOString().split("T")[0] ?? null,
    endDate: data.endDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes,
  }

  const [products, workOrders] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    // Daftar pilihan perintah kerja untuk Combobox "Perintah Kerja" di form.
    prisma.workOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, documentNo: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <ProductionOrderForm order={order} products={products} workOrders={workOrders}/>
    </div>
  )
}
