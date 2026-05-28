export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { WorkOrderForm } from "@/components/forms/work-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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

  const [customers, items] = await Promise.all([prisma.customer.findMany({ orderBy: { name: "asc" } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true, cost: true } }).then(items => items.map(i => ({ ...i, qtyOnHand: String(i.qtyOnHand), cost: String(i.cost) })))])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "manufacturing", href: "/produksi/perintah-kerja" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <WorkOrderForm workOrder={data as any} customers={customers as any} items={items as any}/>
    </div>
  )
}
