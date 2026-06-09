export const dynamic = "force-dynamic"

import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { InvoiceTable } from "./_components/invoice-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function InvoicesPage() {
  await requirePermission("view_sales_invoices")

  const rawInvoices = await prisma.salesInvoice.findMany({
    include: { customer: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const invoices = rawInvoices.map((inv) => ({
    id: inv.id,
    documentNo: inv.documentNo,
    date: inv.date,
    dueDate: inv.dueDate,
    totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount),
    status: inv.status,
    customer: inv.customer,
  }))

  const tableData = JSON.parse(JSON.stringify(invoices))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Faktur Penjualan</h1>
        <Link href="/penjualan/faktur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-invoice-btn">
          + Buat Faktur
        </Link>
      </div>

      <InvoiceTable data={tableData} />
    </div>
  )
}
