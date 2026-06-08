export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatPeriod } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton, Button } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { requirePermission } from "@/lib/auth/permissions"
import { auth } from "@/lib/auth/auth"
import { Pencil } from "lucide-react"
import { ApprovePayrollButton } from "./_components/approve-button"
import { MarkPaidPayrollButton } from "./_components/mark-paid-button"
import {
  DetailTable,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("view_payroll")
  const session = await auth()

  const { id } = await params

  const numId = Number(id)
  if (isNaN(numId)) notFound()

  const payroll = await prisma.payroll.findUnique({
    where: { id: numId },
    include: { employee: true },
  })

  if (!payroll) notFound()

  const isPrivileged = user.roles.includes("super_admin") || user.roles.includes("hr")
  if (!isPrivileged) {
    const myEmployee = session?.user?.id
      ? await prisma.employee.findFirst({ where: { userId: Number(session.user.id) }, select: { id: true } })
      : null
    if (!myEmployee || payroll.employeeId !== myEmployee.id) notFound()
  }

  const fmt = (val: unknown) =>
    Number(val ?? 0).toLocaleString("id-ID")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Penggajian ${payroll.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Penggajian", href: "/sdm/penggajian" },
          { label: payroll.documentNo },
        ]}
        badge={<StatusChip status={payroll.status} />}
        actions={
          <div className="flex gap-2">
            {payroll.status === "draft" && (
              <>
                <ApprovePayrollButton payrollId={payroll.id} />
                <Button href={`/sdm/penggajian/${payroll.id}/ubah`} variant="secondary">
                  <Pencil size={14} /> Ubah
                </Button>
              </>
            )}
            {payroll.status === "approved" && <MarkPaidPayrollButton payrollId={payroll.id} />}
            <BackButton href="/sdm/penggajian" />
          </div>
        }
      />

      <DetailCard title="Informasi Penggajian">
        <DetailField label="No. Dokumen" value={payroll.documentNo} mono />
        <DetailField label="Karyawan" value={payroll.employee?.name ?? "-"} />
        <DetailField label="Periode" value={formatPeriod(payroll.period)} />
        <DetailField label="Status" value={<StatusChip status={payroll.status} />} />
        <DetailField label="Tanggal Mulai" value={formatDate(payroll.startDate)} />
        <DetailField label="Tanggal Selesai" value={formatDate(payroll.endDate)} />
        {payroll.paymentDate && (
          <DetailField label="Tanggal Pembayaran" value={formatDate(payroll.paymentDate)} />
        )}
      </DetailCard>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <h2 className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-default">Rincian Gaji</h2>
        <DetailTable>
          <DetailTableBody>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Gaji Pokok</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.baseSalary)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Tunjangan</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.allowances)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Lembur</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.overtimeTotal)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Apresiasi</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.appreciationTotal)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Potongan</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.deductions)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Potongan Pinjaman</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.loanDeduction)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Potongan Terlambat ({payroll.lateMinutes} mnt)</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.lateDeduction)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">BPJS Kesehatan (1%)</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.bpjsHealthEmployee)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">BPJS Ketenagakerjaan (JHT+JP)</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.bpjsEmploymentEmployee)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">PPh21</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.pph21)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">Potongan Tidak Hadir ({payroll.absentDays} hari bolos / {payroll.workingDays} hari kerja)</DetailTableTd>
              <DetailTableTd align="right">Rp {fmt(payroll.absentDeduction)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow className="border-t-2 border-default">
              <DetailTableTd className="font-semibold text-foreground">Gaji Bersih</DetailTableTd>
              <DetailTableTd align="right" className="font-semibold text-foreground">Rp {fmt(payroll.netSalary)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-semibold text-foreground">Total</DetailTableTd>
              <DetailTableTd align="right" className="font-semibold text-foreground">Rp {fmt(payroll.totalAmount)}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </div>
    </div>
  )
}
