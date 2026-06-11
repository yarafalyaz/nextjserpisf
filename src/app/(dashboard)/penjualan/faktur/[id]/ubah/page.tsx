export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Faktur" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_sales_orders")

  const { id } = await params

  const data = await prisma.salesInvoice.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const invoice = {
    id: data.id,
    customerId: data.customerId,
    salesOrderId: data.salesOrderId ?? null,
    date: data.date.toISOString().split("T")[0],
    dueDate: data.dueDate?.toISOString().split("T")[0] ?? null,
    notes: data.notes ?? null,
  }

  const [customers, salesOrders] = await Promise.all([prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }), prisma.salesOrder.findMany({ where: { status: "approved" }, orderBy: { createdAt: "desc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/faktur" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <SalesInvoiceForm invoice={invoice} customers={customers} salesOrders={salesOrders}/>
    </div>
  )
}
