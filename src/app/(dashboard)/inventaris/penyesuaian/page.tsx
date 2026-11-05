export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { AdjustmentTable } from "./_components/adjustment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyesuaian Stok" }

export default async function StockAdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  const user = await requirePermission("view_stock_adjustments")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: daftar hanya menampilkan dokumen gudang dalam cakupan.
  const scopeWhere = scope.kind === "assigned"
    ? { warehouseId: { in: scope.warehouseIds } }
    : scope.kind === "none"
      ? { warehouseId: { in: [] as number[] } }
      : {}

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...scopeWhere,
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
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.stockAdjustment.count({ where })

  const tableData = toPlain(adjustments)

  const statusChips = ["", "draft", "processed"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={withListParams("/inventaris/penyesuaian", params, { status: urlStatus || undefined, halaman: undefined })}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? (dbStatus === "processed" ? "Diposting" : statusLabel(dbStatus)) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Penyesuaian"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Penyesuaian Stok</h1>
        <CanCreate permission="create_stock_adjustments">
          <Link href="/inventaris/penyesuaian/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-adj-btn">
            + Buat Penyesuaian
          </Link>
        </CanCreate>
      </div>

      <AdjustmentTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. dokumen..." action="/inventaris/penyesuaian" />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}
