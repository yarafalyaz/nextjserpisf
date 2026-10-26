export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { requireAuth } from "@/lib/auth/permissions"
import { loadOwnPayslipDetail } from "@/lib/reports/payslip-self-data"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { kindLabel } from "@/components/payroll/payroll-component-master"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Slip Gaji" }

export default async function OwnPayslipDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const user = await requireAuth()
  const { slug } = await params

  // null = slip tidak ada / bukan milik sendiri / belum final → 404 jujur.
  const detail = await loadOwnPayslipDetail({ id: user.id, roles: user.roles }, slug)
  if (!detail) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Slip Gaji ${detail.period}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Slip Gaji Saya", href: "/sdm/slip-gaji-saya" },
          { label: "Detail" },
        ]}
        badge={
          <span className="px-3 py-1 rounded-full text-xs font-medium border border-default bg-background text-muted-foreground">
            {detail.statusLabel}
          </span>
        }
        actions={<BackButton href="/sdm/slip-gaji-saya" />}
      />

      <DetailCard title="Ringkasan Slip" columns={3}>
        <DetailField label="No. Dokumen" value={detail.documentNo} mono />
        <DetailField label="Periode" value={detail.period} />
        <DetailField
          label="Rentang Periode"
          value={`${formatDate(detail.startDate, { format: "short" })} – ${formatDate(detail.endDate, { format: "short" })}`}
        />
        <DetailField
          label="Tanggal Bayar"
          value={detail.paymentDate ? formatDate(detail.paymentDate) : "Belum dibayar"}
        />
        <DetailField label="Gaji Pokok" value={formatCurrency(detail.baseSalary)} />
        <DetailField label="Gaji Kotor" value={formatCurrency(detail.grossSalary)} />
        <DetailField label="Gaji Bersih" value={formatCurrency(detail.netSalary)} />
      </DetailCard>

      <DetailCard title="Penghasilan & Potongan" columns={3}>
        <DetailField label="Tunjangan" value={formatCurrency(detail.allowances)} />
        <DetailField label="Potongan" value={formatCurrency(detail.deductions)} />
        <DetailField label="Lembur" value={formatCurrency(detail.overtimeTotal)} />
        <DetailField label="Apresiasi" value={formatCurrency(detail.appreciationTotal)} />
        <DetailField label="Potongan Pinjaman" value={formatCurrency(detail.loanDeduction)} />
        <DetailField label="Potongan Telat" value={formatCurrency(detail.lateDeduction)} />
        <DetailField label="Potongan Absen" value={formatCurrency(detail.absentDeduction)} />
        <DetailField label="BPJS Kesehatan (Karyawan)" value={formatCurrency(detail.bpjsHealthEmployee)} />
        <DetailField label="BPJS Ketenagakerjaan (Karyawan)" value={formatCurrency(detail.bpjsEmploymentEmployee)} />
        <DetailField label="PPh 21" value={formatCurrency(detail.pph21)} />
      </DetailCard>

      <DetailCard title="Kehadiran Periode" columns={4}>
        <DetailField label="Hari Kerja" value={detail.workingDays} />
        <DetailField label="Hari Hadir" value={detail.presentDays} />
        <DetailField label="Hari Absen" value={detail.absentDays} />
        <DetailField label="Menit Telat" value={detail.lateMinutes} />
      </DetailCard>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <h2 className="mb-4 text-base font-semibold text-foreground">Komponen Gaji Slip</h2>
        {detail.componentLines.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Belum ada baris komponen gaji pada slip ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-default text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Komponen</th>
                  <th className="px-3 py-2 font-medium">Jenis</th>
                  <th className="px-3 py-2 text-right font-medium">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {detail.componentLines.map((line, index) => (
                  <tr
                    key={`${line.componentNameSnapshot}-${index}`}
                    className="border-b border-default last:border-0"
                  >
                    <td className="px-3 py-2 font-medium text-foreground">
                      {line.componentNameSnapshot}
                    </td>
                    <td className="px-3 py-2">{kindLabel(line.kindSnapshot)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
