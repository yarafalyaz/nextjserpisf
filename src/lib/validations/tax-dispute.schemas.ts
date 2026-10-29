import { z } from "zod"
import "./zod-locale"

import { dateOnly } from "@/lib/validations/finance.schemas"

/**
 * Skema register sengketa pajak 113-B (F-2026-10-27-113-S).
 * Kata/enum final PUTUSAN LEAD Q-TXD-6.
 */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().trim().max(max).optional(),
  )

const optionalId = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().positive().optional(),
)

const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
)

const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().nonnegative("Nominal tidak boleh negatif").optional(),
)

export const taxAssessmentKinds = [
  "SKPKB",
  "SKPKBT",
  "SKPLB",
  "SKPN",
  "PEMUNGUTAN_PIHAK_KETIGA",
] as const

export const taxDisputeStepKinds = [
  "KEBERATAN",
  "PENGURANGAN_PEMBATALAN",
  "BANDING",
  "GUGATAN",
  "PENINJAUAN_KEMBALI",
] as const

export const taxDisputeStepResults = [
  "DIKABULKAN",
  "DIKABULKAN_SEBAGIAN",
  "DITOLAK",
  "TIDAK_DAPAT_DITERIMA",
] as const

export const taxAssessmentSchema = z.object({
  assessmentNumber: z.string().trim().min(1, "Nomor ketetapan wajib diisi").max(50),
  kind: z.enum(taxAssessmentKinds),
  taxKind: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["ppn", "pph21", "pph23", "pph4_2", "pph_badan", "other"]).optional(),
  ),
  taxPeriod: optionalText(7),
  assessedAmount: z.coerce.number().nonnegative("Nominal ketetapan tidak boleh negatif"),
  disputedAmount: z.coerce.number().nonnegative("Nominal disengketakan tidak boleh negatif"),
  sentAt: optionalDate,
  receivedAt: optionalDate,
  taxPaymentId: optionalId,
  taxInvoiceId: optionalId,
  notes: optionalText(2000),
})

export const taxDisputeStepSchema = z.object({
  assessmentId: z.coerce.number().int().positive("Ketetapan wajib dipilih"),
  kind: z.enum(taxDisputeStepKinds),
  article36Subkind: optionalText(50),
  filedAt: optionalDate,
  lateReason: optionalText(2000),
  evidenceRef: optionalText(200),
})

export const taxDisputeDecisionSchema = z.object({
  stepId: z.coerce.number().int().positive("Upaya wajib dipilih"),
  result: z.enum(taxDisputeStepResults),
  decidedAt: dateOnly,
  decidedAmount: optionalMoney,
  decisionNotes: optionalText(2000),
})
