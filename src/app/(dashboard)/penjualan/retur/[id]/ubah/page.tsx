export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { SalesReturnForm } from "@/components/forms/sales-return-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Retur" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_sales_orders")

  const { id } = await params

  const data = await prisma.salesReturn.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const returnData = {
    id: data.id,
    salesInvoiceId: data.salesInvoiceId ?? 0,
    date: data.date.toISOString().split("T")[0],
    reason: data.reason,
  }

  const [invoices, customers, items] = await Promise.all([prisma.salesInvoice.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, documentNo: true } }), prisma.customer.findMany({ orderBy: { name: "asc" } }), prisma.item.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/retur" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <SalesReturnForm returnData={returnData} invoices={invoices} customers={customers} items={items}/>
    </div>
  )
}
