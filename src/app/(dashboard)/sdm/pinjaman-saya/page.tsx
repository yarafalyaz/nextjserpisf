export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { loadEmployeeLoanChannels } from "@/lib/reports/employee-loan-channel-data"
import { EMPLOYEE_LOAN_CHANNEL_LABELS } from "@/lib/reports/employee-loan-channel"
import { Banknote } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { LoanTable } from "../pinjaman/_components/loan-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pinjaman Saya" }

export default async function MyLoanRequestsPage() {
  const user = await requirePermission("create_employee_loan_requests")
  const scope = await getHrScope(user)

  // Pinjaman Saya = hanya milik sendiri pada scope apa pun (self/department/
  // all): kunci self sama dengan halaman tambah — employee tertaut user
  // login, BUKAN hrScopeWhere (department/all melebar ke orang lain).
  const ownEmployeeId =
    scope.kind === "self"
      ? scope.employeeId
      : (
          await prisma.employee.findFirst({
            where: { userId: Number(user.id) },
            select: { id: true },
          })
        )?.id

  if (ownEmployeeId == null) notFound()

  const loans = await prisma.employeeLoan.findMany({
    where: { employeeId: ownEmployeeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      loanDate: true,
      totalAmount: true,
      monthlyInstallment: true,
      remainingAmount: true,
      status: true,
      employeeId: true,
      createdBy: true,
    },
  })
  const channels = await loadEmployeeLoanChannels(loans)

  const data = loans.map((l) => ({
    id: l.id,
    slug: null,
    employee: { name: "" },
    loanDate: l.loanDate.toISOString(),
    totalAmount: Number(l.totalAmount),
    monthlyInstallment: Number(l.monthlyInstallment),
    remainingAmount: Number(l.remainingAmount),
    status: l.status,
    channel: channels.get(l.id) ? EMPLOYEE_LOAN_CHANNEL_LABELS[channels.get(l.id)!] : null,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Pinjaman Saya</h1>
        <Link
          href="/sdm/pinjaman-saya/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
          id="create-my-loan-btn"
        >
          <Banknote size={16} /> Ajukan Pinjaman
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState title="Belum ada pengajuan pinjaman." description="Gunakan tombol Ajukan Pinjaman untuk membuat pengajuan pertama." />
      ) : (
        <LoanTable data={data} total={data.length} page={1} pageSize={data.length || 10} showActions={false} showEmployeeColumn={false} readOnly />
      )}
    </div>
  )
}
