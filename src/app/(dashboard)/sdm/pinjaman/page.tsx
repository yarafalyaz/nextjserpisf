import { parsePagination } from "@/lib/utils/pagination"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere, canSearchAcrossEmployees } from "@/lib/auth/hr-scope"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { Banknote } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { LoanTable } from "./_components/loan-table"
import { CanCreate } from "@/components/auth/can-create"
import { loadEmployeeLoanChannels } from "@/lib/reports/employee-loan-channel-data"
import { EMPLOYEE_LOAN_CHANNEL_LABELS } from "@/lib/reports/employee-loan-channel"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pinjaman" }

export default async function EmployeeLoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string; halaman?: string; pageSize?: string }>
}) {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...hrScopeWhere(scope),
    ...(params.cari && canSearchAcrossEmployees(scope) && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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

  const userRoles: string[] = user.roles ?? [];
  const userPerms: string[] = (user as any).permissions ?? [];
  const showActions =
    userRoles.includes("super_admin") ||
    userPerms.includes("create_loans") ||
    userPerms.includes("delete_loans");
  const showEmployeeColumn = scope.kind !== "self";

  // BR-LOAN 162-V: nilai DB valid = active (berjalan) | paid_off (lunas
  // via dokumen) | written_off (final hapus-buku, bukan populasi aktif).
  // pending/rejected wilayah persetujuan, bukan filter daftar berjalan.
  const statusChips = ["", "active", "paid_off", "written_off"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/sdm/pinjaman${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pinjaman Karyawan</h1>
        <CanCreate permission="create_loans">
          <Link href="/sdm/pinjaman/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-loan-btn">
            <Banknote size={16} /> Tambah Pinjaman
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
        toolbar={<AppSearchField placeholder="Cari nama karyawan..." action="/sdm/pinjaman" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
