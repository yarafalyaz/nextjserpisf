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

  // Item pesanan dibawa sebagai NILAI AWAL faktur. Sebelumnya halaman ini hanya
  // mengoper id pesanan + pelanggan, jadi faktur hasil konversi lahir dengan
  // tabel item kosong dan kasir harus mengetik ulang seluruh baris. Nilainya
  // tetap boleh diubah di form (fabrikasi: spesifikasi bisa berubah).
  let initialItems: Array<{
    itemId: number | null
    description: string | null
    qty: number
    unitPrice: number
    discount: number
  }> = []
  let initialTaxRate = 0

  if (defaultSalesOrderId) {
    const order = await prisma.salesOrder.findUnique({
      where: { id: defaultSalesOrderId },
      select: {
        customerId: true,
        subtotal: true,
        discount: true,
        tax: true,
        items: {
          orderBy: { id: "asc" },
          select: { itemId: true, description: true, qty: true, unitPrice: true, discount: true },
        },
      },
    })
    if (order) {
      defaultCustomerId = defaultCustomerId ?? order.customerId
      initialItems = order.items.map((item) => ({
        itemId: item.itemId,
        description: item.description,
        qty: Number(item.qty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
      }))
      const dasarPengenaan = Number(order.subtotal) - Number(order.discount)
      initialTaxRate = dasarPengenaan > 0
        ? Math.round((Number(order.tax) / dasarPengenaan) * 100 * 100) / 100
        : 0
    }
  }

  // Daftar barang untuk editor item: tanpa ini baris hasil konversi tidak bisa
  // diganti ke barang lain dan baris baru tidak punya pilihan.
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, price: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur",href:"/penjualan/faktur"},{label:"Tambah"}]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Faktur</h1>
      </div>
      <SalesInvoiceForm
        customers={customers}
        salesOrders={salesOrders}
        defaultSalesOrderId={defaultSalesOrderId}
        defaultCustomerId={defaultCustomerId}
        initialItems={initialItems}
        initialTaxRate={initialTaxRate}
        availableItems={items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          price: Number(item.price),
        }))}
      />
    </div>
  )
}
