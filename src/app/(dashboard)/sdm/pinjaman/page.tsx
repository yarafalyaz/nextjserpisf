export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { Banknote } from "lucide-react"
import { AppSearchField } from "@/components/ui/search-field"
import { LoanTable } from "./_components/loan-table"
import { } from "@/components/ui/breadcrumbs"

export default async function EmployeeLoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_employee_loans")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { employee: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const loans = await prisma.employeeLoan.findMany({
    where,
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  })

  const data = loans.map((l) => ({
    id: l.id,
    employee: { name: l.employee.name },
    loanDate: l.loanDate.toISOString(),
    totalAmount: Number(l.totalAmount),
    monthlyInstallment: Number(l.monthlyInstallment),
    remainingAmount: Number(l.remainingAmount),
    status: l.status,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pinjaman Karyawan</h1>
        <Link href="/sdm/pinjaman/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-loan-btn">
          <Banknote size={16} /> Tambah Pinjaman
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama karyawan..." action="/sdm/pinjaman" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "active", "paid"].map((dbStatus) => {
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
            })}
          </div>
        </div>

        <LoanTable data={data} />
      </div>
    </div>
  )
}
