export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteEmployeeLoan } from "@/actions/hrm.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { CanCreate } from "@/components/auth/can-create"
import { hasPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { loadLoanInstallmentHistory } from "@/lib/reports/loan-installment-history-data"
import { LoanInstallmentHistorySection } from "../_components/loan-installment-history-section"
import { LoanCashRepaymentForm } from "@/components/sdm/loan-cash-repayment-form"
import { LoanWriteOffButton } from "@/components/sdm/loan-write-off-button"
export const metadata: Metadata = { title: "Pinjaman" }

export default async function EmployeeLoanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requirePermission("view_employee_loans")
  const scope = await getHrScope(user)

  const { slug } = await params

  const loan = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) =>
        prisma.employeeLoan.findFirst({ where: { slug: s, ...where }, include: { employee: true } }),
      byId: (id, where) =>
        prisma.employeeLoan.findUnique({ where: { id, ...where }, include: { employee: true } }),
    },
  )

  if (!loan) notFound()

  const { history: installmentHistory } = await loadLoanInstallmentHistory(loan.id)

  // BR-LOAN-07/08: dokumen setor-tunai + write-off hanya untuk pinjaman
  // active dan operator berizin process_payroll. Pinjaman final
  // (paid_off/written_off) tidak menawarkan aksi dokumen lagi.
  const canSettle = loan.status === "active" && await hasPermission("process_payroll")
  const accounts = canSettle
    ? await prisma.account.findMany({
        where: { isActive: true, type: "ASSET", code: { startsWith: "1" } },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      })
    : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pinjaman Karyawan"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Pinjaman", href: "/sdm/pinjaman" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={loan.status} />}
        actions={
          <>
            <CanCreate permission="create_loans">
              <Button href={entityEditHref("/sdm/pinjaman", loan)} variant="primary">Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_loans">
              <DeleteButton id={loan.id} action={deleteEmployeeLoan} />
            </CanCreate>
            <BackButton href="/sdm/pinjaman" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Karyawan" value={loan.employee.name} />
        <DetailField label="No. Karyawan" value={loan.employee.employeeNo} mono />
        <DetailField label="Tanggal Pinjaman" value={formatDate(loan.loanDate)} />
        <DetailField label="Jumlah Pinjaman" value={formatCurrency(Number(loan.totalAmount))} />
        <DetailField label="Angsuran/Bulan" value={formatCurrency(Number(loan.monthlyInstallment))} />
        <DetailField label="Cicilan Mingguan (Perjanjian Tertulis)" value={loan.weeklyInstallment === null ? "-" : formatCurrency(Number(loan.weeklyInstallment))} />
        <DetailField label="Sisa Pinjaman" value={formatCurrency(Number(loan.remainingAmount))} />
        <DetailField label="Status" value={<StatusChip status={loan.status} />} />
        {loan.notes && (
          <DetailField label="Catatan" value={loan.notes} colSpan="full" />
        )}
      </DetailCard>

      {installmentHistory ? (
        <LoanInstallmentHistorySection history={installmentHistory} />
      ) : null}

      {canSettle ? (
        <section aria-label="Dokumen pelunasan pinjaman" className="flex flex-col gap-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">Pelunasan Pinjaman</h2>
            <LoanWriteOffButton loanId={loan.id} remainingAmount={Number(loan.remainingAmount)} />
          </div>
          <LoanCashRepaymentForm
            loanId={loan.id}
            remainingAmount={Number(loan.remainingAmount)}
            accounts={accounts}
          />
        </section>
      ) : null}
    </div>
  )
}
