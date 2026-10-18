export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import { InvoiceTable } from "./_components/invoice-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Faktur" }

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_sales_invoices")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  // InvoiceTable berjalan dalam mode server dan kotak carinya menulis ?cari=,
  // jadi filternya WAJIB di sini — kalau tidak, kotak cari tidak menyaring
  // apa pun, termasuk saat tiba dari tautan ?cari= di halaman pelanggan/proyek.
  const where = cari
    ? {
        OR: [
          { documentNo: { contains: cari } },
          { customer: { name: { contains: cari } } },
        ],
      }
    : {}

  const rawInvoices = await prisma.salesInvoice.findMany({
    where,
    include: { customer: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const invoices = rawInvoices.map((inv) => ({
    id: inv.id,
    slug: inv.slug,
    documentNo: inv.documentNo,
    date: inv.date,
    dueDate: inv.dueDate,
    totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount),
    status: inv.status,
    customer: inv.customer,
  }))

  const total = await prisma.salesInvoice.count({ where })

  const tableData = toPlain(invoices)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Faktur Penjualan</h1>
        <Link href="/penjualan/faktur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-invoice-btn">
          + Buat Faktur
        </Link>
      </div>

      <InvoiceTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
