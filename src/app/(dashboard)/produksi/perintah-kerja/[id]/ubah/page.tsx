export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { WorkOrderForm } from "@/components/forms/work-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Perintah Kerja" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.workOrder.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const workOrder = {
    id: data.id,
    customerId: data.customerId,
    quotationId: data.quotationId,
    projectId: data.projectId,
    date: data.date.toISOString().split("T")[0],
    notes: data.notes,
  }

  const [customers, items] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, cost: true } }).then(items => items.map(i => ({ ...i, cost: String(i.cost) })))])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi/perintah-kerja" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <WorkOrderForm workOrder={workOrder} customers={customers} items={items}/>
    </div>
  )
}
