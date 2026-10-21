"use server"

import { z } from "zod"

import { requirePermission } from "@/lib/auth/permissions"
import { parseFormData } from "@/lib/validations/parse-form"
import {
  cancelTaxInvoice,
  creditInputInvoice,
  issueTaxInvoice,
  replaceTaxInvoice,
} from "@/lib/services/tax-invoice.service"
import {
  issueWithholdingCertificate,
  revokeWithholdingCertificate,
  settleWithholdingTax,
} from "@/lib/services/withholding-certificate.service"

/**
 * Server action tipis F-001/F-002 (TaxInvoice) + F-003 (bupot/setor):
 * validasi Zod + permission existing, delegasi penuh ke service.
 * Tanpa permission khusus faktur/bupot di katalog, pemakaian ulang
 * `create_tax_payments` (domain setor pajak) — jangan ciptakan key baru
 * tanpa migrasi katalog permission.
 */

const REVALIDATE_TAX = "/laporan/pajak"

const optionalText = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().max(200).optional(),
)
const optionalId = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.coerce.number().int().positive().optional(),
)

const issueSchema = z.object({
  direction: z.enum(["out", "in"]),
  transactionCode: optionalText,
  taxInvoiceNumber: z.string().trim().min(1, "Nomor faktur pajak wajib diisi").max(50),
  taxInvoiceDate: z.coerce.date(),
  sellingPrice: z.coerce.number().positive("Harga jual/penggantian harus > 0"),
  nominalRate: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(100).optional(),
  ),
  salesInvoiceId: optionalId,
  vendorBillId: optionalId,
  vendorId: optionalId,
  counterpartyTaxId: optionalText,
  counterpartyName: optionalText,
  counterpartyNitku: optionalText,
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

const replaceSchema = z.object({
  replacesId: z.coerce.number().int().positive(),
  taxInvoiceNumber: z.string().trim().min(1, "Nomor faktur pajak wajib diisi").max(50),
  taxInvoiceDate: z.coerce.date(),
  sellingPrice: z.coerce.number().positive("Harga jual/penggantian harus > 0"),
  replaceReason: z.string().trim().min(1, "Alasan pengganti wajib diisi").max(500),
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

const cancelSchema = z.object({
  id: z.coerce.number().int().positive(),
  cancelReason: z.string().trim().min(1, "Alasan pembatalan wajib diisi").max(500),
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

const creditSchema = z.object({
  id: z.coerce.number().int().positive(),
  creditPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Masa kredit harus YYYY-MM"),
  nonCreditableReason: optionalText,
  creditablePercent: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().min(0).max(100).optional(),
  ),
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

export async function issueTaxInvoiceAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(issueSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return issueTaxInvoice({ ...parsed.data, userId: Number(user.id) })
}

export async function replaceTaxInvoiceAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(replaceSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return replaceTaxInvoice({ ...parsed.data, userId: Number(user.id) })
}

export async function cancelTaxInvoiceAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(cancelSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return cancelTaxInvoice({ ...parsed.data, userId: Number(user.id) })
}

export async function creditInputInvoiceAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(creditSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return creditInputInvoice({ ...parsed.data, userId: Number(user.id) })
}

const issueBupotSchema = z.object({
  direction: z.enum(["we_withhold", "withheld_from_us"]),
  certificateNumber: z.string().trim().min(1, "Nomor bupot wajib diisi").max(100),
  withholdingDate: z.coerce.date(),
  counterpartyTaxId: optionalText,
  counterpartyName: z.string().trim().min(1, "Nama pihak wajib diisi").max(200),
  withholdingTypeId: z.coerce.number().int().positive(),
  dpp: z.coerce.number().nonnegative("DPP tidak boleh negatif"),
  vendorBillId: optionalId,
  salesPaymentId: optionalId,
  facility: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.enum(["SKB", "PP23", "DTP"]).optional(),
  ),
  facilityNumber: optionalText,
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

const revokeBupotSchema = z.object({
  id: z.coerce.number().int().positive(),
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

const settleSchema = z.object({
  withholdingTypeId: z.coerce.number().int().positive(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Masa setor harus YYYY-MM"),
  taxAccountId: optionalId,
  paymentAccountId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("Jumlah setor harus > 0"),
  billingCode: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().regex(/^\d{15}$/, "Kode billing harus 15 digit").optional(),
  ),
  ntpn: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.string().length(16, "NTPN harus 16 karakter").optional(),
  ),
  reference: optionalText,
  notes: optionalText,
  idempotencyKey: z.string().trim().min(8, "Idempotency key wajib"),
})

export async function issueWithholdingCertificateAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(issueBupotSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return issueWithholdingCertificate({
    ...parsed.data,
    facility: parsed.data.facility ?? null,
    userId: Number(user.id),
  })
}

export async function revokeWithholdingCertificateAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(revokeBupotSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return revokeWithholdingCertificate({ ...parsed.data, userId: Number(user.id) })
}

export async function settleWithholdingTaxAction(formData: FormData) {
  const user = await requirePermission("create_tax_payments")
  const parsed = parseFormData(settleSchema, formData)
  if (!parsed.success) return { success: false, error: parsed.error }
  return settleWithholdingTax({ ...parsed.data, userId: Number(user.id) })
}

export { REVALIDATE_TAX }
