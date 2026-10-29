/**
 * Loader read-only register ketetapan sengketa pajak (113-B).
 *
 * Fail-closed SEBELUM query (AC-TXD-B5, Q-TXD-8): izin
 * `view_tax_disputes` ditegakkan di sini; tanpa izin loader melempar
 * sebelum query apa pun. Nominal TIDAK bocor ke role tanpa izin.
 *
 * Populasi: `deletedAt: null` (hapus fisik mustahil, AC-TXD-B6).
 * Baca-saja mutlak: hanya findMany; NOL jurnal, NOL tulis TaxPayment
 * (BR-TXD-11). Lampiran lewat TransactionAttachment polimorfik existing.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildTaxDisputeRegisterQueue,
  type TaxDisputeAssessmentInput,
  type TaxDisputeRegisterQueue,
} from "@/lib/reports/tax-dispute-register-queue"

export async function getTaxDisputeRegisterQueue(): Promise<TaxDisputeRegisterQueue> {
  await requirePermission("view_tax_disputes")

  const assessments = await prisma.taxAssessment.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      slug: true,
      assessmentNumber: true,
      kind: true,
      taxKind: true,
      assessedAmount: true,
      disputedAmount: true,
      paidUnderProtest: true,
      sentAt: true,
      status: true,
      deletedAt: true,
      steps: {
        select: {
          id: true,
          kind: true,
          article36Subkind: true,
          status: true,
          filedAt: true,
          decidedAt: true,
          decidedAmount: true,
          lateReason: true,
        },
        orderBy: [{ filedAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
  })

  const inputs: TaxDisputeAssessmentInput[] = assessments.map((a) => ({
    assessmentId: a.id,
    slug: a.slug,
    assessmentNumber: a.assessmentNumber,
    kind: a.kind,
    taxKind: a.taxKind,
    assessedAmount: Number(a.assessedAmount),
    disputedAmount: Number(a.disputedAmount),
    paidUnderProtest: Number(a.paidUnderProtest),
    sentAt: a.sentAt,
    status: a.status,
    deletedAt: a.deletedAt,
    steps: a.steps.map((s) => ({
      stepId: s.id,
      kind: s.kind,
      article36Subkind: s.article36Subkind,
      status: s.status,
      filedAt: s.filedAt,
      decidedAt: s.decidedAt,
      decidedAmount: s.decidedAmount == null ? null : Number(s.decidedAmount),
      lateReason: s.lateReason,
    })),
  }))

  return buildTaxDisputeRegisterQueue(inputs)
}
