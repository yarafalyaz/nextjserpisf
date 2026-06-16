export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { PurchaseRequestForm } from "@/components/forms/purchase-request-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Permintaan Pembelian" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_purchase_orders")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const [data, items, employees] = await Promise.all([
    prisma.purchaseRequest.findUnique({
      where: { id: numId },
      include: { items: true },
    }),
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
  ])

  if (!data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pembelian", href: "/pembelian" },
        { label: "Permintaan", href: "/pembelian/permintaan" },
        { label: data.documentNo },
        { label: "Ubah" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Permintaan Pembelian</h1>
      </div>
      <PurchaseRequestForm request={{
        id: data.id,
        title: data.title,
        date: data.date.toISOString().split("T")[0],
        requestedBy: data.requestedBy != null ? String(data.requestedBy) : null,
        notes: data.notes,
        requestDate: data.requestDate?.toISOString().split("T")[0] ?? null,
        description: data.description,
        items: data.items.map((item) => ({ itemId: item.itemId, qty: Number(item.qty), notes: item.notes ?? "" })),
      }} items={items} employees={employees} />
    </div>
  )
}
