export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteEmployeeLoan } from "@/actions/hrm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Pinjaman" }

export default async function EmployeeLoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_employees")

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
            <Button href={`/sdm/pinjaman/${loan.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={loan.id} action={deleteEmployeeLoan} />
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
        <DetailField label="Sisa Pinjaman" value={formatCurrency(Number(loan.remainingAmount))} />
        <DetailField label="Status" value={<StatusChip status={loan.status} />} />
        {loan.notes && (
          <DetailField label="Catatan" value={loan.notes} colSpan="full" />
        )}
      </DetailCard>
    </div>
  )
}
