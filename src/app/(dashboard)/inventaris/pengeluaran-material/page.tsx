export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { MaterialIssueTable } from "./_components/material-issue-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengeluaran Material" }

export default async function MaterialIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_material_issues")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const issues = await prisma.materialIssue.findMany({
    where,
    include: { warehouse: true, items: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.materialIssue.count({ where })

  const tableData = toPlain(issues)

  const statusChips = ["", "draft", "issued"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/inventaris/pengeluaran-material${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{label:"Dasbor",href:"/"},{label:"Inventaris",href:"/inventaris"},{label:"Pengeluaran Material"}]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pengeluaran Material</h1>
        <CanCreate permission="create_material_issues">
          <Link href="/inventaris/pengeluaran-material/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-mi-btn">
            + Buat Pengeluaran Material
          </Link>
        </CanCreate>
      </div>

      <MaterialIssueTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. dokumen..." action="/inventaris/pengeluaran-material" />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}
