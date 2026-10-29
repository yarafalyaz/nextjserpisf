export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import Link from "next/link"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { BackButton } from "@/components/ui/page-header"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { TAX_DISPUTE_REGISTER_TITLE } from "@/lib/reports/tax-dispute-register-queue"
import {
  taxDisputeAssessmentKindLabel,
  taxDisputeStatusLabel,
  TAX_DISPUTE_STEP_KIND_LABELS,
  TAX_DISPUTE_PASAL36_SUBKIND_LABELS,
} from "../_components/tax-dispute-labels"
import { TaxDisputeStepForm } from "../_components/tax-dispute-step-form"
import { TaxDisputeDecisionForm } from "../_components/tax-dispute-decision-form"
import { CancelTaxAssessmentButton } from "../_components/cancel-tax-assessment-button"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Ketetapan Pajak" }

const RESULT_LABELS: Record<string, string> = {
  DIKABULKAN: "Dikabulkan",
  DIKABULKAN_SEBAGIAN: "Dikabulkan Sebagian",
  DITOLAK: "Ditolak",
  TIDAK_DAPAT_DITERIMA: "Tidak Dapat Diterima",
}

export default async function TaxAssessmentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_tax_disputes")
  const { slug } = await params

  const assessment = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) =>
        prisma.taxAssessment.findFirst({
          where: { slug: s, deletedAt: null },
          include: { steps: { orderBy: [{ filedAt: "asc" }, { id: "asc" }] } },
        }),
      byId: (id) =>
        prisma.taxAssessment.findFirst({
          where: { id, deletedAt: null },
          include: { steps: { orderBy: [{ filedAt: "asc" }, { id: "asc" }] } },
        }),
    },
  )

  if (!assessment) notFound()

  const [canCreate, canEdit] = await Promise.all([
    hasPermission("create_tax_disputes"),
    hasPermission("edit_tax_disputes"),
  ])

  const canAct = assessment.status !== "BATAL" && assessment.status !== "SELESAI"
  const activeSteps = assessment.steps.filter((s) => s.status !== "DIPUTUS" && s.status !== "BATAL")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Sengketa Pajak", href: "/keuangan/sengketa-pajak" },
          { label: assessment.assessmentNumber ?? `#${assessment.id}` },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton href="/keuangan/sengketa-pajak" label="Kembali ke register" />
          <h1 className="text-2xl font-bold text-foreground">
            {TAX_DISPUTE_REGISTER_TITLE} — {assessment.assessmentNumber ?? `#${assessment.id}`}
          </h1>
        </div>
        {canEdit && canAct ? (
          <CancelTaxAssessmentButton id={assessment.id} />
        ) : null}
      </div>

      <DetailCard title="Ketetapan">
        <DetailField label="Nomor Ketetapan" value={assessment.assessmentNumber ?? "-"} />
        <DetailField label="Jenis Ketetapan" value={taxDisputeAssessmentKindLabel(assessment.kind)} />
        <DetailField label="Jenis Pajak" value={assessment.taxKind ?? "-"} />
        <DetailField label="Masa Pajak" value={assessment.taxPeriod ?? "-"} />
        <DetailField label="Nominal Ketetapan" value={formatCurrency(Number(assessment.assessedAmount))} />
        <DetailField label="Nominal Disengketakan" value={formatCurrency(Number(assessment.disputedAmount))} />
        <DetailField label="Dibayar di Bawah Protes" value={formatCurrency(Number(assessment.paidUnderProtest))} />
        <DetailField label="Tanggal Kirim SKP" value={assessment.sentAt ? formatDate(assessment.sentAt) : "-"} />
        <DetailField
          label="Status"
          value={<StatusChip status={assessment.status} customLabel={taxDisputeStatusLabel(assessment.status)} />}
        />
        {assessment.notes && <DetailField label="Keterangan" value={assessment.notes} />}
      </DetailCard>

      <section aria-label="Upaya sengketa" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Upaya Sengketa</h2>
        {assessment.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada upaya sengketa tercatat.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-default bg-surface shadow-sm">
            <DetailTable aria-label="Daftar upaya sengketa">
              <DetailTableHead>
                <DetailTableTh>Jenis Upaya</DetailTableTh>
                <DetailTableTh>Sub-jenis Pasal 36</DetailTableTh>
                <DetailTableTh>Tanggal Pengajuan</DetailTableTh>
                <DetailTableTh>Tanggal Putusan</DetailTableTh>
                <DetailTableTh>Hasil</DetailTableTh>
                <DetailTableTh>Status</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {assessment.steps.map((s) => (
                  <DetailTableRow key={s.id}>
                    <DetailTableTd>{TAX_DISPUTE_STEP_KIND_LABELS[s.kind] ?? s.kind}</DetailTableTd>
                    <DetailTableTd>
                      {s.article36Subkind
                        ? (TAX_DISPUTE_PASAL36_SUBKIND_LABELS[s.article36Subkind] ?? s.article36Subkind)
                        : "-"}
                    </DetailTableTd>
                    <DetailTableTd>{s.filedAt ? formatDate(s.filedAt) : "-"}</DetailTableTd>
                    <DetailTableTd>{s.decidedAt ? formatDate(s.decidedAt) : "-"}</DetailTableTd>
                    <DetailTableTd>{s.result ? (RESULT_LABELS[s.result] ?? s.result) : "-"}</DetailTableTd>
                    <DetailTableTd>
                      <StatusChip status={s.status} customLabel={taxDisputeStatusLabel(s.status)} />
                      {s.lateReason && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Lewat tenggat: {s.lateReason}
                        </p>
                      )}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        )}
      </section>

      {canCreate && canAct ? (
        <CanCreate permission="create_tax_disputes">
          <section aria-label="Ajukan upaya" className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">Ajukan Upaya</h2>
            <TaxDisputeStepForm assessmentId={assessment.id} />
          </section>
        </CanCreate>
      ) : null}

      {canEdit && canAct && activeSteps.length > 0 ? (
        <section aria-label="Catat putusan" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">Catat Putusan</h2>
          <TaxDisputeDecisionForm
            steps={activeSteps.map((s) => ({
              value: String(s.id),
              label: `${TAX_DISPUTE_STEP_KIND_LABELS[s.kind] ?? s.kind}${s.filedAt ? ` — ${formatDate(s.filedAt)}` : ""}`,
            }))}
          />
        </section>
      ) : null}

      <section aria-label="Lampiran ketetapan" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Lampiran</h2>
        <TransactionAttachments referenceType="tax_assessment" referenceId={assessment.id} />
        {assessment.steps.map((s) => (
          <div key={s.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">
              Lampiran upaya: {TAX_DISPUTE_STEP_KIND_LABELS[s.kind] ?? s.kind} #{s.id}
            </h3>
            <TransactionAttachments referenceType="tax_dispute_step" referenceId={s.id} />
          </div>
        ))}
      </section>

      {canCreate ? (
        <p className="text-sm text-muted-foreground">
          Butuh ketetapan lain?{" "}
          <Link href="/keuangan/sengketa-pajak/tambah" className="text-primary hover:underline">
            Daftarkan ketetapan baru
          </Link>
          .
        </p>
      ) : null}
    </div>
  )
}
