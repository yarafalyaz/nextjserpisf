import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { Plus } from "@/components/ui/fontawesome-icons"

export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { LeaveTable } from "./_components/leave-table"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Cuti" }

export const LEAVE_REQUEST_VALID_DB_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const

export interface LeaveRequestsPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderLeaveRequestsPage({
  statusParam,
  searchParams,
}: LeaveRequestsPageProps) {
  const user = await requirePermission("view_leave_requests")
  // Self-service scoping: karyawan hanya lihat cutinya sendiri, kepala_bengkel
  // se-departemen, HR/finance/admin/ga semua.
  const scope = await getHrScope(user)

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/sdm/cuti/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = LEAVE_REQUEST_VALID_DB_STATUSES.map(
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

  const leaves = await prisma.leaveRequest.findMany({
    where,
    include: { employee: { select: { name: true } } },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.leaveRequest.count({ where })

  const data = toPlain(leaves)

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("edit_leave_requests") ||
    userPerms.includes("delete_leave_requests")
  const showEmployeeColumn = scope.kind !== "self"

  const statusChips = ["", ...LEAVE_REQUEST_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/sdm/cuti/status/${urlStatus}` : "/sdm/cuti"
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
    ? `/sdm/cuti/status/${activeUrlStatus}`
    : "/sdm/cuti"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">Permintaan & Saldo Cuti (Leave)</h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengajuan cuti tahunan, izin sakit, pelacakan sisa hak cuti karyawan, dan persetujuan atasan.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/sdm/cuti/saldo"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors shadow-2xs cursor-pointer"
            id="leave-balance-btn"
          >
            Saldo Cuti
          </Link>
          <CanCreate permission="create_leave_requests">
            <Link
              href="/sdm/cuti/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-leave-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Ajukan Cuti</span>
            </Link>
          </CanCreate>
        </div>
      </div>

      <LeaveTable
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

export default async function LeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderLeaveRequestsPage({ searchParams })
}
