export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteEmployeeLoan } from "@/actions/hrm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EmployeeLoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const loan = await prisma.employeeLoan.findUnique({
    where: { id: Number(id) },
    include: {
      employee: true,
    },
  })

  if (!loan) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pinjaman Karyawan</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={loan.status} />
  <div className="flex gap-2">
          <Link href={`/hrm/loans/${loan.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={loan.id} action={deleteEmployeeLoan} />
                  <Link href="/hrm/loans" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{loan.employee.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Karyawan</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{loan.employee.employeeNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah Pinjaman</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(loan.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Angsuran/Bulan</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(loan.installmentAmount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Sisa Pinjaman</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(loan.remainingAmount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Mulai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(loan.startDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={loan.status} /></span>
          </div>
          {loan.reason && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Alasan</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{loan.reason}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
