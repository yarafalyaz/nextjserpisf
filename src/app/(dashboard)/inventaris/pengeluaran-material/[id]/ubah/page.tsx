/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { MaterialIssueForm } from "@/components/forms/material-issue-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.materialIssue.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [warehouses, items] = await Promise.all([prisma.warehouse.findMany({ orderBy: { name: "asc" } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, qtyOnHand: true, cost: true } }).then(items => items.map(i => ({ ...i, qtyOnHand: String(i.qtyOnHand), cost: String(i.cost) })))])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Inventaris", href: "/inventaris/pengeluaran-material" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <MaterialIssueForm issue={data as any} warehouses={warehouses as any} items={items as any}/>
    </div>
  )
}
