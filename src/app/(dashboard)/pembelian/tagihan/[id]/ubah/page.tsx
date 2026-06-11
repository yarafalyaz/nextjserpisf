export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VendorBillForm } from "@/components/forms/vendor-bill-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Tagihan" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_purchase_orders")

  const { id } = await params

  const data = await prisma.vendorBill.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const bill = {
    id: data.id,
    vendorId: data.vendorId,
    purchaseOrderId: data.purchaseOrderId,
    date: data.date.toISOString().split("T")[0],
    dueDate: data.dueDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes,
    vendorInvoiceNumber: data.vendorInvoiceNumber,
    terms: data.terms,
  }

  const [vendors, items] = await Promise.all([prisma.vendor.findMany({ orderBy: { name: "asc" } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, cost: true, unitOfMeasure: true } }).then(items => items.map(i => ({ ...i, cost: Number(i.cost) })))])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Tagihan", href: "/pembelian/tagihan" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <VendorBillForm bill={bill} vendors={vendors} items={items}/>
    </div>
  )
}
