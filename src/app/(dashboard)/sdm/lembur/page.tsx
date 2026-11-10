export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { OvertimeTable } from "./_components/overtime-table"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Lembur" }

export const OVERTIME_REQUEST_VALID_DB_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const

export interface OvertimePageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderOvertimePage({
  statusParam,
  searchParams,
}: OvertimePageProps) {
  const user = await requirePermission("view_overtime")
  const scope = await getHrScope(user)

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/sdm/lembur/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = OVERTIME_REQUEST_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...hrScopeWhere(scope),
    ...(params.cari && canSearchAcrossEmployees(scope) && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const overtimes = await prisma.overtimeRequest.findMany({
    where,
    include: { employee: { select: { name: true } }, project: { select: { name: true } } },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.overtimeRequest.count({ where })

  const data = toPlain(overtimes)

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("edit_overtime_requests") ||
    userPerms.includes("delete_overtime_requests")
  const showEmployeeColumn = scope.kind !== "self"

  const statusChips = ["", ...OVERTIME_REQUEST_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/sdm/lembur/status/${urlStatus}` : "/sdm/lembur"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/sdm/lembur/status/${activeUrlStatus}`
    : "/sdm/lembur"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Permintaan Lembur</h1>
        <CanCreate permission="create_overtime_requests">
          <Link
            href="/sdm/lembur/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-overtime-btn"
          >
            + Ajukan Lembur
          </Link>
        </CanCreate>
      </div>

      <OvertimeTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        showActions={showActions}
        showEmployeeColumn={showEmployeeColumn}
        toolbar={
          canSearchAcrossEmployees(scope) ? (
            <AppSearchField placeholder="Cari nama karyawan..." action={currentActionPath} />
          ) : undefined
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderOvertimePage({ searchParams })
}
