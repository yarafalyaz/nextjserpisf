export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { WorkOrderForm } from "@/components/forms/work-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Perintah Kerja" }

export default async function CreateWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ quotationId?: string }>
}) {
  await requirePermission("create_work_orders")
  const params = await searchParams
  const quotationId = params.quotationId ? Number(params.quotationId) : undefined

  const [customers, items] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, cost: true } }),
  ])

  // Pre-fill from quotation if provided
  let quotation = null
  if (quotationId) {
    quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { customer: true },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Kerja", href: "/produksi/perintah-kerja" },
  { label: "Tambah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Perintah Kerja</h1>
      </div>
      <WorkOrderForm
        customers={customers}
        items={JSON.parse(JSON.stringify(items))}
        quotationId={quotationId}
        defaultCustomerId={quotation?.customerId}
      />
    </div>
  )
}
