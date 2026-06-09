export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { AdjustmentTable } from "./_components/adjustment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyesuaian Stok" }

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_stock_adjustments")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const adjustments = await prisma.stockAdjustment.findMany({
    where,
    include: { warehouse: true, items: true },
    take: 1000,
    orderBy: { createdAt: "desc" },
  })

  const tableData = JSON.parse(JSON.stringify(adjustments))

  const statusChips = ["", "draft", "processed"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/inventaris/penyesuaian${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Penyesuaian"}]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Penyesuaian Stok</h1>
<Link href="/inventaris/penyesuaian/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-adj-btn">
          + Buat Penyesuaian
        </Link>
      </div>

      <AdjustmentTable
        data={tableData}
        toolbar={<AppSearchField placeholder="Cari no. dokumen..." action="/inventaris/penyesuaian" />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}
