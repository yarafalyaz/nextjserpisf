export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { QuotationTable } from "./_components/quotation-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FilterDrawer } from "@/components/ui/filter-drawer"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penawaran" }

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string }>
}) {
  await requirePermission("view_quotations")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { customer: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const rawQuotations = await prisma.quotation.findMany({
    where,
    include: { customer: true, customerVehicle: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const quotations = rawQuotations.map((q) => ({
    id: q.id,
    documentNo: q.documentNo,
    customer: q.customer,
    customerVehicle: q.customerVehicle,
    date: q.date,
    grandTotal: Number(q.grandTotal),
    status: q.status,
  }))

  const tableData = JSON.parse(JSON.stringify(quotations))

  const statusChips = ["", "draft", "sent", "accepted", "converted", "cancelled"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/penjualan/penawaran${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan" },
  { label: "Penawaran" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penawaran</h1>
<Link href="/penjualan/penawaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-quotation-btn">
          + Buat Penawaran
        </Link>
      </div>

      <QuotationTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen atau pelanggan..." action="/penjualan/penawaran" />}
        filters={
          <>
            <FilterDrawer>
              <div className="flex flex-col gap-2">{statusChips}</div>
            </FilterDrawer>
            <div className="hidden flex-wrap gap-1.5 lg:flex">{statusChips}</div>
          </>
        }
      />
    </div>
  )
}
