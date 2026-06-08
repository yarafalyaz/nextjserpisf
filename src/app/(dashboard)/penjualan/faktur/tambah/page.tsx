export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateSalesInvoicePage() {
  await requirePermission("create_sales_invoices")

  const [customers, salesOrders] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.salesOrder.findMany({
      where: { status: { in: ["draft", "confirmed"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur",href:"/penjualan/faktur"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Faktur</h1>
      </div>
      <SalesInvoiceForm customers={customers} salesOrders={salesOrders} />
    </div>
  )
}
