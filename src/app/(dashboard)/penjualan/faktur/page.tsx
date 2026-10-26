export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import Link from "next/link"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { InvoiceTable } from "./_components/invoice-table"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Faktur" }

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>
}) {
  return renderInvoicesPage(searchParams)
}

export async function renderInvoicesPage(
  searchParams: Promise<{ cari?: string; halaman?: string; pageSize?: string }>,
  overdueOnly = false,
) {
  await requirePermission("view_sales_invoices")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const cari = params.cari?.trim()

  // InvoiceTable berjalan dalam mode server dan kotak carinya menulis ?cari=,
  // jadi filternya WAJIB di sini — kalau tidak, kotak cari tidak menyaring
  // apa pun, termasuk saat tiba dari tautan ?cari= di halaman pelanggan/proyek.
  // Mode jatuh tempo memakai kondisi sama persis dengan penghitung widget:
  // sudah lewat tanggal jatuh tempo, belum lunas, tak terhapus, dan statusnya
  // sudah diakui sebagai piutang (Q-SIQ-6: draft/approved/sent belum terbit
  // bukan piutang — jurnal hanya lahir di postInvoice).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueWhere = overdueOnly
    ? {
        dueDate: { lt: today },
        paymentStatus: { not: "paid" },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      }
    : {}

  const where = cari
    ? {
        ...overdueWhere,
        OR: [
          { documentNo: { contains: cari } },
          { customer: { name: { contains: cari } } },
        ],
      }
    : overdueWhere

  const rawInvoices = await prisma.salesInvoice.findMany({
    where,
    include: { customer: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: overdueOnly ? { dueDate: "asc" } : { createdAt: "desc" },
  })

  const invoices = rawInvoices.map((inv) => ({
    id: inv.id,
    slug: inv.slug,
    documentNo: salesInvoiceLabel(inv),
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
      <AppBreadcrumbs items={overdueOnly
        ? [{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur",href:"/penjualan/faktur"},{label:"Jatuh Tempo"}]
        : [{label:"Dasbor",href:"/"},{label:"Penjualan",href:"/penjualan"},{label:"Faktur"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{overdueOnly ? "Faktur Jatuh Tempo" : "Faktur Penjualan"}</h1>
        <div className="flex items-center gap-2">
          {overdueOnly && (
            <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
              Jatuh tempo ({total})
            </span>
          )}
          <CanCreate permission="create_sales_invoices">
            <Link href="/penjualan/faktur/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-invoice-btn">
              + Buat Faktur
            </Link>
          </CanCreate>
        </div>
      </div>

      <InvoiceTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
