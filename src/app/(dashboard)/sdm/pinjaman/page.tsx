import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { Banknote } from "@/components/ui/fontawesome-icons"
import { AppSearchField } from "@/components/ui/search-field"
import { LoanTable } from "./_components/loan-table"
import { CanCreate } from "@/components/auth/can-create"
import { loadEmployeeLoanChannels } from "@/lib/reports/employee-loan-channel-data"
import { EMPLOYEE_LOAN_CHANNEL_LABELS } from "@/lib/reports/employee-loan-channel"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pinjaman" }

export const EMPLOYEE_LOAN_VALID_DB_STATUSES = [
  "active",
  "paid_off",
  "written_off",
] as const

export interface EmployeeLoansPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderEmployeeLoansPage({
  statusParam,
  searchParams,
}: EmployeeLoansPageProps) {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/sdm/pinjaman/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = EMPLOYEE_LOAN_VALID_DB_STATUSES.map(
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

  const loans = await prisma.employeeLoan.findMany({
    where,
    include: { employee: true },
    take,
    skip: (page - 1) * pageSize,
    orderBy: { createdAt: "desc" },
  })

  const total = await prisma.employeeLoan.count({ where })

  const channels = await loadEmployeeLoanChannels(loans)
  const data = loans.map((l) => ({
    id: l.id,
    slug: l.slug,
    employee: { name: l.employee.name },
    loanDate: l.loanDate.toISOString(),
    totalAmount: Number(l.totalAmount),
    monthlyInstallment: Number(l.monthlyInstallment),
    remainingAmount: Number(l.remainingAmount),
    status: l.status,
    channel: channels.get(l.id) ? EMPLOYEE_LOAN_CHANNEL_LABELS[channels.get(l.id)!] : null,
  }))

  const userRoles: string[] = user.roles ?? []
  const userPerms: string[] = user.permissions ?? []
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_loans") ||
    userPerms.includes("delete_loans")
  const showEmployeeColumn = scope.kind !== "self"

  // BR-LOAN 162-V: nilai DB valid = active (berjalan) | paid_off (lunas
  // via dokumen) | written_off (final hapus-buku, bukan populasi aktif).
  // pending/rejected wilayah persetujuan, bukan filter daftar berjalan.
  const statusChips = ["", ...EMPLOYEE_LOAN_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/sdm/pinjaman/status/${urlStatus}` : "/sdm/pinjaman"
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
    ? `/sdm/pinjaman/status/${activeUrlStatus}`
    : "/sdm/pinjaman"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pinjaman Karyawan</h1>
        <CanCreate permission="create_loans">
          <Link
            href="/sdm/pinjaman/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-md transition-all"
            id="create-loan-btn"
          >
            <Banknote size={16} /> Ajukan Pinjaman
          </Link>
        </CanCreate>
      </div>

      <LoanTable
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

export default async function EmployeeLoansPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderEmployeeLoansPage({ searchParams })
}
