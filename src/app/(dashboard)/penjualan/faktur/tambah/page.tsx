export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Faktur" }

export default async function CreateSalesInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ salesOrderId?: string; quotationId?: string }>
}) {
  await requirePermission("create_sales_invoices")

  const params = await searchParams
  const wantedSalesOrderId = params.salesOrderId ? Number(params.salesOrderId) : undefined
  const wantedQuotationId = params.quotationId ? Number(params.quotationId) : undefined

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

  // Tautan "buat dari" dari Perintah Kerja mengirim ?quotationId= (perintah kerja
  // lahir dari penawaran). Faktur sendiri tertaut ke PESANAN PENJUALAN, jadi
  // penawaran itu diterjemahkan ke pesanannya supaya prefill-nya benar-benar
  // terjadi — sebelumnya parameter ini dikirim tetapi tidak dibaca halaman ini.
  let defaultSalesOrderId = wantedSalesOrderId
  let defaultCustomerId: number | undefined
  if (!defaultSalesOrderId && wantedQuotationId) {
    const so = await prisma.salesOrder.findFirst({
      where: { quotationId: wantedQuotationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, documentNo: true, customerId: true },
    })
    if (so) {
      defaultSalesOrderId = so.id
      defaultCustomerId = so.customerId
      if (!salesOrders.some((s) => s.id === so.id)) {
        // Pesanannya sudah lewat status draft/confirmed: tetap sertakan supaya
        // pilihannya tidak kosong di form.
        salesOrders.unshift({ id: so.id, documentNo: so.documentNo })
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur",href:"/penjualan/faktur"},{label:"Tambah"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Faktur</h1>
      </div>
      <SalesInvoiceForm
        customers={customers}
        salesOrders={salesOrders}
        defaultSalesOrderId={defaultSalesOrderId}
        defaultCustomerId={defaultCustomerId}
      />
    </div>
  )
}
