"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { logActivity } from "@/lib/services/activity-log.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import {
  TAX_DISPUTE_CLOSED_STATUSES,
  assertAssessmentKind,
  assertBandinPrerequisite,
  assertNoDuplicateActiveObjection,
  assertNoSecondPk,
  assertStepKind,
  assertStepResult,
  isStepLate,
  toMoney,
} from "@/lib/services/tax-dispute.service"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { nextSlug } from "@/lib/utils/slug-db"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  taxAssessmentSchema,
  taxDisputeDecisionSchema,
  taxDisputeStepSchema,
} from "@/lib/validations/tax-dispute.schemas"

/**
 * Server action register sengketa pajak 113-B (F-2026-10-27-113-S).
 *
 * REGISTER DOKUMEN SAJA (BR-TXD-11): NOL jurnal, NOL tulis TaxPayment.
 * Guard AC-TXD-B1..B6 + empat mata Q-TXD-8 (perekam putusan != pengaju).
 */

const REVALIDATE = "/keuangan/sengketa-pajak"

export interface TaxDisputeActionResult {
  success: boolean
  error?: string
  id?: number
}

export async function createTaxAssessment(formData: FormData): Promise<TaxDisputeActionResult> {
  try {
    const user = await requirePermission("create_tax_disputes")
    const parsed = parseFormData(taxAssessmentSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    assertAssessmentKind(v.kind)
    if (v.disputedAmount > v.assessedAmount) {
      return { success: false, error: "Nominal disengketakan tidak boleh melebihi nominal ketetapan." }
    }

    const sentAt = v.sentAt ? wibDateToUtcMidnight(v.sentAt) : null
    const receivedAt = v.receivedAt ? wibDateToUtcMidnight(v.receivedAt) : null
    if (sentAt) await assertPeriodOpen(sentAt)

    const idempotencyKey = formData.get("idempotencyKey") as string | null

    const created = await prisma.$transaction(async (tx) => {
      await checkIdempotency(idempotencyKey, tx, user.id)
      const documentNo = v.assessmentNumber
      return tx.taxAssessment.create({
        data: {
          slug: await nextSlug("taxAssessment", documentNo),
          assessmentNumber: v.assessmentNumber,
          kind: v.kind,
          taxKind: v.taxKind ?? null,
          taxPeriod: v.taxPeriod ?? null,
          assessedAmount: toMoney(v.assessedAmount),
          disputedAmount: toMoney(v.disputedAmount),
          paidUnderProtest: toMoney(0),
          sentAt,
          receivedAt,
          status: "TERDAFTAR",
          taxPaymentId: v.taxPaymentId ?? null,
          taxInvoiceId: v.taxInvoiceId ?? null,
          notes: v.notes ?? null,
          createdBy: Number(user.id),
        },
      })
    })

    await logActivity("create", "TaxAssessment", created.id, `Ketetapan pajak ${created.assessmentNumber}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan ketetapan pajak.") }
  }
}

export async function createTaxDisputeStep(formData: FormData): Promise<TaxDisputeActionResult> {
  try {
    const user = await requirePermission("create_tax_disputes")
    const parsed = parseFormData(taxDisputeStepSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    assertStepKind(v.kind, v.article36Subkind ?? null)

    const filedAt = v.filedAt ? wibDateToUtcMidnight(v.filedAt) : null
    if (filedAt) await assertPeriodOpen(filedAt)

    const idempotencyKey = formData.get("idempotencyKey") as string | null

    // Atomik: baris ketetapan dikunci FOR UPDATE, lalu status + rantai upaya
    // dicek ULANG di dalam tx — tanpa ini dua pengajuan konkuren sama-sama
    // lolos penjaga rantai dari baca luar yang basi.
    const created = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM tax_assessments WHERE id = ${v.assessmentId} FOR UPDATE`
      const assessment = await tx.taxAssessment.findFirst({
        where: { id: v.assessmentId, deletedAt: null },
        select: {
          id: true,
          sentAt: true,
          status: true,
          steps: {
            select: { kind: true, status: true, article36Subkind: true, filedAt: true, lateReason: true },
          },
        },
      })
      if (!assessment) throw new Error("Ketetapan tidak ditemukan.")
      if (assessment.status === "BATAL" || assessment.status === "SELESAI") {
        throw new Error("Ketetapan sudah selesai/batal, upaya baru ditolak.")
      }

      const stepLikes = assessment.steps.map((s) => ({
        kind: s.kind,
        article36Subkind: s.article36Subkind,
        status: s.status,
        filedAt: s.filedAt,
        lateReason: s.lateReason,
      }))
      // AC-TXD-B2: tiga penjaga rantai upaya.
      assertNoDuplicateActiveObjection(stepLikes, v.kind)
      assertBandinPrerequisite(stepLikes, v.kind)
      assertNoSecondPk(stepLikes, v.kind)

      // AC-TXD-B4: lewat tenggat butuh alasan, bukan auto-ditolak.
      const late = isStepLate(assessment.sentAt, filedAt, v.kind)
      if (late && !v.lateReason) {
        throw new Error("Upaya melewati tenggat: alasan keadaan di luar kekuasaan wajib diisi.")
      }

      await checkIdempotency(idempotencyKey, tx, user.id)
      const step = await tx.taxDisputeStep.create({
        data: {
          assessmentId: assessment.id,
          kind: v.kind,
          article36Subkind: v.article36Subkind ?? null,
          status: "DIAJUKAN",
          filedAt,
          lateReason: v.lateReason ?? null,
          filedBy: Number(user.id),
          evidenceRef: v.evidenceRef ?? null,
          createdBy: Number(user.id),
        },
      })
      await tx.taxAssessment.update({
        where: { id: assessment.id },
        data: { status: "DIPROSES" },
      })
      return step
    })

    await logActivity("create", "TaxDisputeStep", created.id, `Upaya ${v.kind} atas ketetapan #${v.assessmentId}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: created.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error, "Gagal menyimpan upaya sengketa.") }
  }
}

export async function recordTaxDisputeDecision(formData: FormData): Promise<TaxDisputeActionResult> {
  try {
    const user = await requirePermission("edit_tax_disputes")
    const parsed = parseFormData(taxDisputeDecisionSchema, formData)
    if (!parsed.success) return { success: false, error: parsed.error }
    const v = parsed.data

    assertStepResult(v.result)

    const decidedAt = wibDateToUtcMidnight(v.decidedAtInput)
    await assertPeriodOpen(decidedAt)

    const decidedAmount = v.decidedAmount ?? 0
    const idempotencyKey = formData.get("idempotencyKey") as string | null

    // Atomik: baris ketetapan dikunci FOR UPDATE, upaya + nominal dibaca
    // ULANG di dalam tx, lalu upaya diklaim lewat updateMany bersyarat —
    // tanpa ini dua perekam konkuren sama-sama lolos cek "belum ditutup"
    // dari baca luar dan putusan ganda tertulis.
    const updated = await prisma.$transaction(async (tx) => {
      const probe = await tx.taxDisputeStep.findUnique({
        where: { id: v.stepId },
        select: { assessmentId: true },
      })
      if (!probe) throw new Error("Upaya tidak ditemukan.")
      await tx.$queryRaw`SELECT id FROM tax_assessments WHERE id = ${probe.assessmentId} FOR UPDATE`

      const step = await tx.taxDisputeStep.findUnique({
        where: { id: v.stepId },
        select: {
          id: true,
          assessmentId: true,
          status: true,
          filedBy: true,
          assessment: { select: { disputedAmount: true, status: true } },
        },
      })
      if (!step) throw new Error("Upaya tidak ditemukan.")
      if ((TAX_DISPUTE_CLOSED_STATUSES as readonly string[]).includes(step.status)) {
        throw new Error("Upaya sudah ditutup, putusan ganda ditolak.")
      }

      // Q-TXD-8 empat mata: perekam putusan != pengaju upaya.
      if (step.filedBy != null && Number(step.filedBy) === Number(user.id)) {
        throw new Error("Empat mata: perekam putusan harus berbeda dari pengaju upaya.")
      }
      if (decidedAmount > Number(step.assessment.disputedAmount)) {
        throw new Error("Nominal putusan tidak boleh melebihi nominal disengketakan.")
      }

      await checkIdempotency(idempotencyKey, tx, user.id)
      const claimed = await tx.taxDisputeStep.updateMany({
        where: { id: step.id, status: { notIn: [...TAX_DISPUTE_CLOSED_STATUSES] } },
        data: {
          status: "DIPUTUS",
          decidedAt,
          decidedAmount: toMoney(decidedAmount),
          result: v.result,
          decisionBy: Number(user.id),
          decisionNotes: v.decisionNotes ?? null,
        },
      })
      if (claimed.count === 0) throw new Error("Upaya sudah ditutup, putusan ganda ditolak.")
      // AC-TXD-B6: sisa disengketakan turunan server (baca, bukan kolom);
      // status ketetapan mengikuti putusan-sebagian/penuh. Hanya putusan
      // yang MENGABULKAN yang mengurangi sisa — DITOLAK/TIDAK_DAPAT_DITERIMA
      // tidak memakan kuota disengketakan.
      const siblings = await tx.taxDisputeStep.findMany({
        where: {
          assessmentId: step.assessmentId,
          status: "DIPUTUS",
          result: { in: ["DIKABULKAN", "DIKABULKAN_SEBAGIAN"] },
        },
        select: { decidedAmount: true, result: true },
      })
      const decidedSum = siblings.reduce((acc, s) => acc + Number(s.decidedAmount ?? 0), 0)
      const full = decidedSum >= Number(step.assessment.disputedAmount)
      await tx.taxAssessment.update({
        where: { id: step.assessmentId },
        data: { status: full ? "SELESAI" : "DIPUTUS_SEBAGIAN" },
      })
      return { id: step.id }
    })

    await logActivity("update", "TaxDisputeStep", updated.id, `Putusan ${v.result} upaya #${v.stepId}`)
    revalidatePath(REVALIDATE)
    return { success: true, id: updated.id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error, "Gagal mencatat putusan sengketa.") }
  }
}

/** AC-TXD-B6: hapus fisik mustahil — hanya status BATAL + deletedAt lunak. */
export async function cancelTaxAssessment(formData: FormData): Promise<TaxDisputeActionResult> {
  try {
    await requirePermission("edit_tax_disputes")
    const id = Number(formData.get("id"))
    if (!Number.isInteger(id) || id <= 0) return { success: false, error: "Ketetapan wajib dipilih." }
    const reason = String(formData.get("reason") ?? "").trim()
    if (!reason) return { success: false, error: "Alasan pembatalan wajib diisi." }

    const assessment = await prisma.taxAssessment.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, notes: true },
    })
    if (!assessment) return { success: false, error: "Ketetapan tidak ditemukan." }
    if (assessment.status === "BATAL" || assessment.status === "SELESAI") {
      return { success: false, error: "Ketetapan sudah selesai/batal, tidak dapat dibatalkan." }
    }

    // Notes asli register tidak ditimpa: alasan batal ditambahkan terpisah
    // di belakang penanda, supaya riwayat keterangan tetap terbaca.
    const cancelNote = `[Batal: ${reason}]`
    const notes = assessment.notes ? `${assessment.notes}\n${cancelNote}` : cancelNote
    await prisma.taxAssessment.update({
      where: { id },
      data: { status: "BATAL", deletedAt: new Date(), notes },
    })
    await logActivity("update", "TaxAssessment", id, `Batal ketetapan #${id}: ${reason}`)
    revalidatePath(REVALIDATE)
    return { success: true, id }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error, "Gagal membatalkan ketetapan.") }
  }
}
