import { Pencil } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteEmployee } from "@/actions/master.actions"
import { getLeaveQuota } from "@/lib/services/leave-quota.service"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { LEAVE_TYPE_LABELS, labelFrom } from "@/lib/utils/status-labels"
import {
  employmentStatusLabel,
  employmentEndReasonLabel,
} from "@/lib/reports/employee-lifecycle"
import { hasPermission } from "@/lib/auth/permissions"
import {
  assertHrEmployeeAccess,
  getHrScope,
  hrEmployeeScopeWhere,
} from "@/lib/auth/hr-scope"
import {
  getEmployeePayrollComponents,
  getPayrollComponents,
} from "@/actions/hrm.actions"
import {
  getContractDecisionRequests,
  getProbationOverview,
} from "@/actions/probation.actions"
import {
  CONTRACT_DECISION_KIND_LABELS,
  probationMilestoneSlots,
  type ContractDecisionKind,
} from "@/lib/reports/probation"
import {
  ProbationContractPanel,
  type ContractDecisionRow,
  type ProbationMilestoneRow,
} from "../_components/probation-contract-panel"
import { canViewSalaryAmounts } from "@/lib/auth/field-visibility"
import { getSalaryAdjustments } from "@/actions/salary-adjustment.actions"
import {
  CancelSalaryAdjustmentButton,
  SalaryAdjustmentForm,
} from "./_components/salary-adjustment-form"

const SALARY_REASON_LABELS: Record<string, string> = {
  berkala: "Kenaikan Berkala",
  promosi: "Promosi",
  umk: "Penyesuaian UMK/UMP",
  kinerja: "Kinerja",
  penyesuaian: "Penyesuaian Struktur",
  lainnya: "Lainnya",
}

const SALARY_STATUS_LABELS: Record<string, string> = {
  scheduled: "Terjadwal",
  applied: "Diterapkan",
  cancelled: "Dibatalkan",
}

const CONTRACT_DECISION_STATUS_LABELS: Record<string, string> = {
  draft: "Draf",
  submitted: "Diajukan",
  approved: "Disetujui",
  rejected: "Ditolak",
  applied: "Diterapkan",
  cancelled: "Dibatalkan",
}
import { EmployeePayrollComponents, type EmployeePayrollComponentRow } from "@/components/payroll/employee-payroll-components"
import {
  SalaryAdjustmentPanel,
  type SalaryAdjustmentRow,
} from "../_components/salary-adjustment-panel"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Karyawan" }

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const sessionUser = await requirePermission("view_employees")
  const { slug } = await params

  const employee = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.employee.findFirst({
          where: { slug: s },
          include: {
            department: true,
            position: true,
            manager: { select: { name: true } },
            user: {
              include: {
                roles: true,
              },
            },
            leaveRequests: { take: 10, orderBy: { createdAt: "desc" } },
            overtimeRequests: { take: 10, orderBy: { date: "desc" } },
            payrolls: { take: 12, orderBy: { createdAt: "desc" } },
            employeeLoans: { where: { status: "active" } },
          },
        }),
      byId: (id) =>
        prisma.employee.findUnique({
          where: { id },
          include: {
            department: true,
            position: true,
            manager: { select: { name: true } },
            user: {
              include: {
                roles: true,
              },
            },
            leaveRequests: { take: 10, orderBy: { createdAt: "desc" } },
            overtimeRequests: { take: 10, orderBy: { date: "desc" } },
            payrolls: { take: 12, orderBy: { createdAt: "desc" } },
            employeeLoans: { where: { status: "active" } },
          },
        }),
    },
  )

  if (!employee) notFound()

  // Annual-leave balance for the current calendar year (surface in Info tab).
  const leaveQuota = await getLeaveQuota(employee.id)

  // Penugasan komponen gaji tetap: hanya untuk pemegang create_employees
  // (aksi server juga menuntut cakupan semua karyawan; gagal = pesan apa adanya).
  const canManageComponents = await hasPermission("create_employees")
  const [assignmentsResult, componentsResult] = canManageComponents
    ? await Promise.all([
        getEmployeePayrollComponents(employee.id),
        getPayrollComponents(),
      ])
    : [null, null]
  const componentAssignments: EmployeePayrollComponentRow[] =
    assignmentsResult?.success && assignmentsResult.data
      ? assignmentsResult.data.map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          componentId: a.componentId,
          defaultAmount: a.defaultAmount,
          isActive: a.isActive,
          component: a.component,
          effectiveFrom: new Date(a.effectiveFrom).toISOString(),
          effectiveTo: a.effectiveTo ? new Date(a.effectiveTo).toISOString() : null,
        }))
      : []
  const fixedComponents =
    componentsResult?.success && componentsResult.data
      ? componentsResult.data
          .filter((c) => c.isActive && c.recurrence === "fixed")
          .map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
      : []

  // F-2026-10-24-099-S: panel masa percobaan & keputusan kontrak.
  // Fakta turunan (status/titik jatuh tempo) dari loader/builder server
  // apa adanya; UI tidak menghitung skor/status/tanggal. Ulasan dimuat
  // sempit (tanpa nominal) hanya untuk merender nilai tersimpan.
  const canEditProbation = await hasPermission("edit_employees")
  const canApproveContracts = await hasPermission("approve_contracts")
  // Riwayat kenaikan gaji: nominal hanya turun ke pemegang izin nominal
  // gaji; tanpa izin, panel dan angka tidak dirender sama sekali.
  const canSeeSalary = await canViewSalaryAmounts()
  const salaryHistory = canSeeSalary
    ? await getSalaryAdjustments(employee.id)
    : null
  const salaryRows: {
    id: number
    effectiveDate: string
    previousBaseSalary: number
    newBaseSalary: number
    changePercent: number | null
    reason: string
    status: string
  }[] = salaryHistory?.success ? salaryHistory.data : []
  // Baca RSC probation tunduk pada scope HR yang sama dengan aksi server
  // (assertHrEmployeeAccess + hrScopeWhere/hrEmployeeScopeWhere). Di luar
  // scope: ulasan + opsi penilai dikosongkan, bukan bocor semua karyawan.
  const hrScope = await getHrScope(sessionUser)
  const probationInScope = await assertHrEmployeeAccess(hrScope, employee.id)
    .then(() => true)
    .catch(() => false)
  const [overviewRows, reviewRows, decisionRows, reviewerRows] = await Promise.all([
    getProbationOverview().catch(() => []),
    probationInScope
      ? prisma.probationReview.findMany({
          where: { employeeId: employee.id },
          select: {
            id: true,
            milestone: true,
            reviewerEmployeeId: true,
            technicalScore: true,
            disciplineScore: true,
            attendanceScore: true,
            notes: true,
            recommendation: true,
            status: true,
          },
        })
      : Promise.resolve([]),
    getContractDecisionRequests(employee.id).catch((error) => {
      // null = penanda gagal eksplisit: panel menampilkan decisionsError.
      console.error("[Karyawan] Gagal memuat pengajuan keputusan kontrak", error)
      return null
    }),
    canEditProbation && probationInScope
      ? prisma.employee.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            id: { not: employee.id },
            ...hrEmployeeScopeWhere(hrScope),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ])
  const overviewRow = overviewRows.find((r) => r.employeeId === employee.id) ?? null
  const probationMilestones: ProbationMilestoneRow[] =
    employee.probationEndDate == null
      ? []
      : probationMilestoneSlots(employee.joinDate, employee.probationEndDate).map((slot) => {
          const review = reviewRows.find((r) => r.milestone === slot.milestone) ?? null
          return {
            milestone: slot.milestone,
            label: slot.label,
            dueDate: slot.dueDate.toISOString(),
            isFinal: slot.isFinal,
            reviewStatus: review?.status ?? null,
            reviewId: review?.id ?? null,
            reviewerEmployeeId: review?.reviewerEmployeeId ?? null,
            technicalScore: review?.technicalScore ?? null,
            disciplineScore: review?.disciplineScore ?? null,
            attendanceScore: review?.attendanceScore ?? null,
            notes: review?.notes ?? null,
            recommendation: review?.recommendation ?? null,
          }
        })
  const contractDecisions: ContractDecisionRow[] = (decisionRows ?? []).map((d) => ({
    id: d.id,
    kind: d.kind,
    kindLabel:
      CONTRACT_DECISION_KIND_LABELS[d.kind as ContractDecisionKind] ?? d.kind,
    proposedContractEndDate: d.proposedContractEndDate
      ? new Date(d.proposedContractEndDate).toISOString()
      : null,
    reason: d.reason,
    status: d.status,
    statusLabel: CONTRACT_DECISION_STATUS_LABELS[d.status] ?? d.status,
    rejectionReason: d.rejectionReason,
    createdAt: new Date(d.createdAt).toISOString(),
  }))

  // F-2026-10-26-054-S: penyesuaian gaji (antrean persetujuan + riwayat).
  // Payload nominal hanya dimuat untuk pemegang view_salary_amounts —
  // tanpa izin, panel tidak dirender sama sekali (server juga menolak).
  // Angka/status dari loader ditampilkan apa adanya; UI tidak menghitung.
  const canViewSalary = await canViewSalaryAmounts()
  const canEditSalary = canViewSalary && (await hasPermission("edit_employees"))
  const canApproveSalary =
    canViewSalary && (await hasPermission("approve_salary_adjustments"))
  const salaryAdjustmentsResult = canViewSalary
    ? await getSalaryAdjustments(employee.id).catch((error) => {
        console.error("[Karyawan] Gagal memuat penyesuaian gaji", error)
        return null
      })
    : null
  const salaryAdjustmentRows: SalaryAdjustmentRow[] =
    salaryAdjustmentsResult?.success && salaryAdjustmentsResult.data
      ? salaryAdjustmentsResult.data
      : []
  const salaryAdjustmentsError = !canViewSalary
    ? null
    : salaryAdjustmentsResult === null
      ? "Penyesuaian gaji tidak dapat dimuat."
      : salaryAdjustmentsResult.success
        ? null
        : salaryAdjustmentsResult.error || "Penyesuaian gaji tidak dapat dimuat."

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={employee.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Karyawan", href: "/master/karyawan" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <CanCreate permission="edit_employees">
              <Button href={entityEditHref("/master/karyawan", employee)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <CanCreate permission="delete_employees">
              <DeleteButton id={employee.id} action={deleteEmployee} />
            </CanCreate>
            <BackButton href="/master/karyawan" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Tab detail karyawan"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <>
                <DetailCard>
                  <DetailField label="NIP" value={employee.employeeNo} mono />
                  <DetailField label="Departemen" value={employee.department?.name || "-"} />
                  <DetailField label="Jabatan" value={employee.position?.name || "-"} />
                  <DetailField label="Atasan Langsung" value={employee.manager?.name || "-"} />
                  <DetailField label="Email" value={employee.email || "-"} />
                  <DetailField label="Telepon" value={employee.phone || "-"} />
                  <DetailField label="Tanggal Masuk" value={formatDate(employee.joinDate)} />
                  <DetailField label="Gaji Pokok" value={canSeeSalary ? formatCurrency(Number(employee.baseSalary)) : "••••••"} />
                  <DetailField label="Peran (Akun)" value={
                    employee.user
                      ? employee.user.roles.map(r => r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(", ") || "-"
                      : "-"
                  } />
                  <DetailField label="Status" value={
                    <span className={`status-badge ${employee.isActive ? "status-active" : "status-cancelled"}`}>
                      {employee.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  } />
                  <DetailField label="Status Kepegawaian" value={employmentStatusLabel(employee.employmentStatus)} />
                  <DetailField label="Tanggal Mulai Kontrak" value={employee.contractStartDate ? formatDate(employee.contractStartDate) : "-"} />
                  <DetailField label="Tanggal Akhir Kontrak" value={employee.contractEndDate ? formatDate(employee.contractEndDate) : "-"} />
                  <DetailField label="Tanggal Berhenti Bekerja" value={employee.employmentEndedAt ? formatDate(employee.employmentEndedAt) : "-"} />
                  <DetailField label="Alasan Berhenti" value={employmentEndReasonLabel(employee.endReason) ?? "-"} />
                </DetailCard>

                {canSeeSalary && (
                  <DetailSection title="Riwayat Kenaikan Gaji">
                    <div className="flex flex-col gap-4">
                      <CanCreate permission="edit_employees">
                        <SalaryAdjustmentForm employeeId={employee.id} />
                      </CanCreate>
                      {salaryRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Belum ada catatan kenaikan gaji.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-default">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-default bg-surface-secondary text-left">
                                <th className="px-4 py-3 font-medium">Efektif</th>
                                <th className="px-4 py-3 font-medium">Dari</th>
                                <th className="px-4 py-3 font-medium">Menjadi</th>
                                <th className="px-4 py-3 font-medium">Perubahan</th>
                                <th className="px-4 py-3 font-medium">Alasan</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                                <th className="px-4 py-3 font-medium">Aksi</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salaryRows.map((r) => (
                                <tr key={r.id} className="border-b border-default last:border-0">
                                  <td className="px-4 py-3">{formatDate(new Date(r.effectiveDate))}</td>
                                  <td className="px-4 py-3">{formatCurrency(r.previousBaseSalary)}</td>
                                  <td className="px-4 py-3">{formatCurrency(r.newBaseSalary)}</td>
                                  <td className="px-4 py-3">{r.changePercent != null ? `${r.changePercent > 0 ? "+" : ""}${r.changePercent}%` : "-"}</td>
                                  <td className="px-4 py-3">{SALARY_REASON_LABELS[r.reason] ?? r.reason}</td>
                                  <td className="px-4 py-3">{SALARY_STATUS_LABELS[r.status] ?? r.status}</td>
                                  <td className="px-4 py-3">
                                    {r.status === "scheduled" ? (
                                      <CancelSalaryAdjustmentButton id={r.id} />
                                    ) : (
                                      "-"
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </DetailSection>
                )}

                {/* Sisa Cuti Tahunan (tahun berjalan) */}
                <DetailSection title={`Saldo Cuti Tahunan ${leaveQuota.year}`}>
                  {leaveQuota.eligible ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-default bg-surface-secondary p-4">
                        <div className="text-xs text-muted-foreground">Jatah</div>
                        <div className="text-xl font-bold text-foreground">{leaveQuota.entitled} hari</div>
                      </div>
                      <div className="rounded-lg border border-default bg-surface-secondary p-4">
                        <div className="text-xs text-muted-foreground">Terpakai</div>
                        <div className="text-xl font-bold text-foreground">{leaveQuota.used} hari</div>
                      </div>
                      <div className="rounded-lg border border-default bg-surface-secondary p-4">
                        <div className="text-xs text-muted-foreground">Sisa</div>
                        <div className={`text-xl font-bold ${leaveQuota.remaining > 0 ? "text-success" : "text-danger"}`}>{leaveQuota.remaining} hari</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Belum berhak cuti tahunan berbayar (masa kerja belum genap 1 tahun).
                    </p>
                  )}
                </DetailSection>

                {/* Active Loans */}
                {employee.employeeLoans.length > 0 && (
                  <DetailSection title="Pinjaman Aktif">
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Jumlah</DetailTableTh>
                        <DetailTableTh>Cicilan</DetailTableTh>
                        <DetailTableTh>Sisa</DetailTableTh>
                        <DetailTableTh>Mulai</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.employeeLoans.map((loan) => (
                          <DetailTableRow key={loan.id}>
                            <DetailTableTd>{formatCurrency(Number(loan.totalAmount))}</DetailTableTd>
                            <DetailTableTd>{formatCurrency(Number(loan.monthlyInstallment))}</DetailTableTd>
                            <DetailTableTd className="text-danger">{formatCurrency(Number(loan.remainingAmount))}</DetailTableTd>
                            <DetailTableTd>{formatDate(loan.loanDate)}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  </DetailSection>
                )}
              </>
            ),
          },
          {
            id: "leave",
            label: `Leave (${employee.leaveRequests.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Cuti</h2>
                  <Link href={`/sdm/cuti?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.leaveRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada data cuti</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Jenis</DetailTableTh>
                        <DetailTableTh>Tanggal Mulai</DetailTableTh>
                        <DetailTableTh>Tanggal Selesai</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh>Alasan</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.leaveRequests.map((lr) => (
                          <DetailTableRow key={lr.id}>
                            <DetailTableTd>{labelFrom(LEAVE_TYPE_LABELS, lr.type)}</DetailTableTd>
                            <DetailTableTd>{formatDate(lr.startDate)}</DetailTableTd>
                            <DetailTableTd>{formatDate(lr.endDate)}</DetailTableTd>
                            <DetailTableTd><StatusChip status={lr.status} /></DetailTableTd>
                            <DetailTableTd>{lr.reason ? (lr.reason.length > 30 ? lr.reason.substring(0, 30) + "..." : lr.reason) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "overtime",
            label: `Overtime (${employee.overtimeRequests.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Lembur</h2>
                  <Link href={`/sdm/lembur?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.overtimeRequests.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada data lembur</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Jam</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh>Alasan</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.overtimeRequests.map((ot) => (
                          <DetailTableRow key={ot.id}>
                            <DetailTableTd>{formatDate(ot.date)}</DetailTableTd>
                            <DetailTableTd>{Number(ot.hours)} jam</DetailTableTd>
                            <DetailTableTd><StatusChip status={ot.status} /></DetailTableTd>
                            <DetailTableTd>{ot.reason ? (ot.reason.length > 30 ? ot.reason.substring(0, 30) + "..." : ot.reason) : "-"}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "probation",
            label: "Masa Percobaan & Kontrak",
            content: (
              <ProbationContractPanel
                employeeId={employee.id}
                employmentStatus={employee.employmentStatus}
                employmentStatusLabel={employmentStatusLabel(employee.employmentStatus)}
                joinDate={employee.joinDate.toISOString()}
                probationEndDate={employee.probationEndDate ? employee.probationEndDate.toISOString() : null}
                derivedStatusLabel={overviewRow?.derivedStatusLabel ?? null}
                milestones={probationMilestones}
                decisions={contractDecisions}
                decisionsError={decisionRows === null ? "Pengajuan keputusan kontrak tidak dapat dimuat." : null}
                reviewerOptions={reviewerRows}
                canEdit={canEditProbation}
                canApprove={canApproveContracts}
              />
            ),
          },
          {
            id: "payroll",
            label: `Penggajian (${employee.payrolls.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Penggajian</h2>
                  <Link href={`/sdm/penggajian?cari=${employee.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {employee.payrolls.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada data penggajian</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Periode</DetailTableTh>
                        <DetailTableTh>Gaji Pokok</DetailTableTh>
                        <DetailTableTh>Gaji Bersih</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {employee.payrolls.map((p) => (
                          <DetailTableRow key={p.id}>
                            <DetailTableTd className="font-mono">{p.documentNo}</DetailTableTd>
                            <DetailTableTd>{p.period}</DetailTableTd>
                            <DetailTableTd>{formatCurrency(Number(p.baseSalary))}</DetailTableTd>
                            <DetailTableTd className="font-semibold">{formatCurrency(Number(p.netSalary))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={p.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
                {canManageComponents && (
                  <div className="border-t border-default p-4 px-5">
                    <h3 className="mb-3 text-[0.9375rem] font-semibold text-foreground">
                      Komponen Gaji Tetap
                    </h3>
                    {assignmentsResult && !assignmentsResult.success ? (
                      <p className="text-sm text-muted-foreground" role="alert">
                        {assignmentsResult.error || "Penugasan komponen gaji tidak dapat dimuat."}
                      </p>
                    ) : (
                      <EmployeePayrollComponents
                        employeeId={employee.id}
                        assignments={componentAssignments}
                        components={fixedComponents}
                      />
                    )}
                  </div>
                )}
                {canViewSalary && (
                  <div className="border-t border-default p-4 px-5">
                    <SalaryAdjustmentPanel
                      employeeId={employee.id}
                      rows={salaryAdjustmentRows}
                      autoCancelledBerhenti={
                        salaryAdjustmentsResult?.success
                          ? salaryAdjustmentsResult.autoCancelledBerhenti
                          : 0
                      }
                      loadError={salaryAdjustmentsError}
                      canEdit={canEditSalary}
                      canApprove={canApproveSalary}
                      currentUserId={Number(sessionUser.id)}
                    />
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
