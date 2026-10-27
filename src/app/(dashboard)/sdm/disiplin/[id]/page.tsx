export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { prisma } from "@/lib/db/prisma"
import { hasPermission, requirePermission } from "@/lib/auth/permissions"
import { getHrScope } from "@/lib/auth/hr-scope"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DisciplinaryRecordActions } from "@/components/reports/disciplinary-record-actions"
import { DISCIPLINARY_TITLE } from "@/components/reports/disciplinary-attention-card"
import { loadDisciplinaryRecords } from "@/lib/reports/disciplinary-data"
import { loadDisciplinaryDeductionDecisionsForRecord } from "@/lib/reports/disciplinary-deduction-data"
import { DisciplinaryDeductionRecordContext } from "@/components/reports/disciplinary-deduction-decisions-card"
import { formatDate } from "@/lib/utils/format"
import { StatusChip } from "@/components/ui/status-chip"

export const metadata: Metadata = { title: "Rincian Surat Peringatan" }

export default async function DisciplinaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("view_disciplinary_records")
  const { id } = await params
  const recordId = Number(id)
  if (!Number.isSafeInteger(recordId) || recordId <= 0) notFound()

  const scope = await getHrScope(user)
  // Fail-closed: rekod di luar scope = tidak ditemukan (AC-DISC-5).
  const records = await loadDisciplinaryRecords(scope)
  const record = records.find((r) => r.id === recordId)
  if (!record) notFound()

  const canViewAmount = await hasPermission("view_payroll")
  const decisions = await loadDisciplinaryDeductionDecisionsForRecord(scope, recordId, canViewAmount)

  const [canCreate, canApprove, me] = await Promise.all([
    hasPermission("create_disciplinary_records"),
    hasPermission("approve_disciplinary_records"),
    prisma.employee.findFirst({
      where: { userId: Number(user.id) },
      select: { id: true },
    }),
  ])
  const canRespond = me?.id === record.employeeId

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: DISCIPLINARY_TITLE, href: "/sdm/disiplin" },
          { label: record.documentNo ?? `Rekod #${record.id}` },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {record.levelLabel ?? record.level}
        </h1>
        <StatusChip status={record.derivedStatus} />
        {record.isVoidRecord ? (
          <StatusChip status="void-record" customLabel="Rekod pembatal" customTone="default" />
        ) : null}
        {record.voidedAt ? (
          <StatusChip status="voided" customLabel="Dibatalkan" customTone="danger" />
        ) : null}
      </div>

      <section
        aria-label="Rincian surat peringatan"
        className="rounded-xl border border-default bg-surface p-5 shadow-sm"
      >
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Karyawan" value={record.employeeName} />
          <Field label="Departemen" value={record.departmentName ?? "—"} />
          <Field label="Nomor Dokumen" value={record.documentNo ?? "Belum diterbitkan"} />
          <Field label="Kategori Pelanggaran" value={record.violationCategory} />
          <Field label="Tanggal Kejadian" value={formatDate(record.violationDate)} />
          <Field
            label="Tanggal Terbit"
            value={record.issuedAt ? formatDate(record.issuedAt) : "Belum diterbitkan"}
          />
          <Field
            label="Berlaku Sampai"
            value={record.expiresAt ? formatDate(record.expiresAt) : "—"}
          />
          <Field label="Pengaju" value={record.requesterName ?? "—"} />
          <Field label="Uraian" value={record.description} />
          <Field
            label="Dasar Peraturan"
            value={record.regulationReference ?? "Belum ada dasar peraturan tercatat"}
          />
          {record.rejectionReason ? (
            <Field label="Alasan Penolakan" value={record.rejectionReason} />
          ) : null}
          {record.voidReason ? <Field label="Alasan Pembatalan" value={record.voidReason} /> : null}
          {record.employeeResponse && !canRespond ? (
            <Field
              label={record.employeeResponseLate ? "Tanggapan Karyawan (terlambat)" : "Tanggapan Karyawan"}
              value={record.employeeResponse}
            />
          ) : null}
        </dl>
      </section>

      <DisciplinaryDeductionRecordContext decisions={decisions} />

      <DisciplinaryRecordActions
        record={record}
        canCreate={canCreate}
        canApprove={canApprove}
        canRespond={canRespond}
      />
    </div>
  )
}

function Field({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  )
}
