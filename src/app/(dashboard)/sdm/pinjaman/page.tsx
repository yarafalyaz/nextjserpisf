import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { Banknote, Coins, Wallet, CheckCircle2, Plus } from "@/components/ui/fontawesome-icons"
import { AppSearchField } from "@/components/ui/search-field"
import { LoanTable } from "./_components/loan-table"
import { CanCreate } from "@/components/auth/can-create"
import { loadEmployeeLoanChannels } from "@/lib/reports/employee-loan-channel-data"
import { EMPLOYEE_LOAN_CHANNEL_LABELS } from "@/lib/reports/employee-loan-channel"
import { formatCurrency } from "@/lib/utils/format"

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

  const [loans, total, statusGroups, activeAgg] = await Promise.all([
    prisma.employeeLoan.findMany({
      where,
      include: { employee: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.employeeLoan.count({ where }),
    prisma.employeeLoan.groupBy({
      by: ["status"],
      where: hrScopeWhere(scope),
      _count: { id: true },
    }),
    prisma.employeeLoan.aggregate({
      where: {
        ...hrScopeWhere(scope),
        status: "active",
      },
      _sum: {
        remainingAmount: true,
      },
    }),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    active: 0,
    paid_off: 0,
    written_off: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count?.id ?? 0
    }
  }

  const remainingActiveSum = Number(activeAgg._sum.remainingAmount ?? 0)

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
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/sdm/pinjaman/status/${activeUrlStatus}`
    : "/sdm/pinjaman"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Pinjaman Karyawan (Employee Loan)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Fasilitas kasbon dan pinjaman karyawan, pelacakan saldo sisa pokok, dan pemotongan angsuran payroll.
          </p>
        </div>
        <CanCreate permission="create_loans">
          <Link
            href="/sdm/pinjaman/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-loan-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Ajukan Pinjaman</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pinjaman
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Banknote className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh fasilitas pinjaman</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Pinjaman Aktif
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.active}
            </span>
            <Coins className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Sedang dalam masa angsuran</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Telah Lunas
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.paid_off}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Pokok pinjaman selesai dilunasi</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sisa Pokok Berjalan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {formatCurrency(remainingActiveSum)}
            </span>
            <Wallet className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Total piutang karyawan aktif</span>
        </div>
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
