/**
 * F-2026-10-25-035-B: gerbang kredit tahap 2 — penilaian server tx-aware.
 *
 * Satu builder (BR-CL2-07/12): rumus paparan TETAP
 * buildCustomerCreditExposure + assessCustomerCreditGate. Service ini hanya
 * memuat komponen K1..K5 per pelanggan DI DALAM transaksi pemanggil,
 * menerapkan delta proyeksi anti-dobel, lalu menurunkan keputusan dari
 * builder yang sama. Dilarang rumus kedua di action/UI.
 *
 * Proyeksi (Q-CL2-3 butir 6 / Q-CL2-4): paparan existing + delta tertagih
 * percobaan, dengan dokumen sumber yang sudah termuat dikecualikan:
 * - SO dari quotation: K5 quotation sumber (bila ada) diganti grandTotal SO.
 * - Invoice dari SO: K2 SO terkait dikurangi grandTotal invoice ini.
 * - Update dokumen existing: delta = nilai baru − nilai lama (dokumen tidak
 *   ditambah ulang); dokumen draft belum masuk K1/K2 sehingga delta penuh.
 * - DP confirm: komponen dibaca SESUDAH status DP ini confirmed di tx yang
 *   sama (pola existing menandai confirmed lebih dulu), delta = grandTotal
 *   quotation yang akan terwakili SO/Invoice hasil konversi.
 *
 * Serialisasi (EC-CL2-1): kunci baris pelanggan FOR UPDATE di awal penilaian
 * — dua simpan bersamaan pelanggan sama tidak memakai paparan basi.
 * Saklar mati (fail-safe false) = tanpa penilaian, tanpa rekod (AC-CL2-B1).
 */

import { createHash } from "node:crypto"

import type { Prisma } from "@prisma/client"

import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  buildCustomerCreditExposure,
  effectiveConfirmedDownPaymentByCustomer,
  openCustomerCreditByCustomer,
  woUnrepresentedByCustomer,
} from "@/lib/reports/customer-receivables"
import {
  assessCustomerCreditGate,
  type CustomerCreditGateAssessment,
} from "@/lib/reports/customer-credit-gate"
import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { loadReturnCreditByInvoiceIdWithClient } from "@/lib/reports/return-credit"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { formatCurrency } from "@/lib/utils/format"

export type CreditGateDocumentType = "sales_order" | "sales_invoice"

export interface CreditGateAttempt {
  customerId: number
  documentType: CreditGateDocumentType
  /** Nominal tertagih penuh percobaan (grandTotal dokumen hasil). */
  attemptedAmount: number
  requestedBy: number
  quotationId?: number | null
  salesOrderId?: number | null
  /** Dokumen existing yang diperbarui (update): dinilai dari delta saja. */
  existingDocumentId?: number | null
  /** Alasan peminta; wajib bila rekod pending harus lahir. */
  requestReason?: string | null
  now?: Date
}

export type CreditGateOutcome =
  | { kind: "gate_off" }
  | { kind: "allowed"; assessment: CustomerCreditGateAssessment }
  | {
      kind: "blocked"
      assessment: CustomerCreditGateAssessment
      overrideId: number | null
      overrideStatus: string | null
      message: string
    }
  | {
      kind: "override_used"
      assessment: CustomerCreditGateAssessment
      overrideId: number
    }
  | {
      kind: "override_pending"
      assessment: CustomerCreditGateAssessment
      overrideId: number
      message: string
    }

type Tx = Prisma.TransactionClient

interface ExposureComponents {
  creditLimit: number
  outstanding: number
  openOrderAmount: number
  confirmedDownPayment: number
  openCustomerCredit: number
  woUnrepresented: number
  /** K2 kontribusi SO terkait saja (untuk proyeksi invoice-dari-SO). */
  linkedOrderOpen: number
  /** K5 kontribusi quotation terkait saja (untuk proyeksi SO-dari-quotation). */
  linkedQuotationWo: number
}

const ACTIVE_WO_STATUSES = ["draft", "pending", "in_progress"] as const
const OPEN_ORDER_STATUSES = ["confirmed", "processing", "completed"] as const

/** Sidik percobaan (Q-CL2-3 butir 3): hash normalisasi, TANPA payload form. */
export function creditAttemptFingerprint(attempt: {
  customerId: number
  documentType: CreditGateDocumentType
  requestedBy: number
  attemptedAmount: number
  quotationId?: number | null
  salesOrderId?: number | null
  existingDocumentId?: number | null
}): string {
  const parts = [
    `c${attempt.customerId}`,
    attempt.documentType,
    `u${attempt.requestedBy}`,
    `a${Math.round(attempt.attemptedAmount * 100)}`,
    `q${attempt.quotationId ?? "-"}`,
    `s${attempt.salesOrderId ?? "-"}`,
    `e${attempt.existingDocumentId ?? "-"}`,
  ]
  return createHash("sha256").update(parts.join("|")).digest("hex")
}

/** 23:59:59.999 WIB hari kalender WIB yang sama dengan `now`. */
export function creditOverrideExpiryWib(now: Date): Date {
  const wib = new Date(now.getTime() + 7 * 3_600_000)
  const endUtc = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
    16,
    59,
    59,
    999,
  )
  return new Date(endUtc)
}

/** Hari kerja WIB berikutnya (Senin–Jumat); Sabtu/Minggu dilompati. */
export function nextWibBusinessDay(now: Date): Date {
  const wib = new Date(now.getTime() + 7 * 3_600_000)
  const day = wib.getUTCDay()
  let add = 1
  // 0=Minggu, 6=Sabtu (dalam jam WIB).
  while (true) {
    const candidate = (day + add) % 7
    if (candidate !== 0 && candidate !== 6) break
    add += 1
  }
  return new Date(now.getTime() + add * 86_400_000)
}

/** Status turunan: approved lewat expiresAt / pending lewat 1 hari kerja. */
export function deriveCreditOverrideStatus(
  row: { status: string; createdAt: Date; expiresAt: Date | null },
  now: Date,
): string {
  if (row.status === "approved" && row.expiresAt && now.getTime() > row.expiresAt.getTime()) {
    return "expired"
  }
  if (row.status === "pending" && now.getTime() > nextWibBusinessDay(row.createdAt).getTime()) {
    return "expired"
  }
  return row.status
}

async function loadComponents(
  tx: Tx,
  customerId: number,
  attempt: CreditGateAttempt,
): Promise<ExposureComponents> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { creditLimit: true, deletedAt: true },
  })
  const creditLimit = Number(customer?.creditLimit ?? 0)

  const invoices = await tx.salesInvoice.findMany({
    where: {
      customerId,
      status: { in: [...RECOGNISED_AR_STATUSES] },
      deletedAt: null,
    },
    select: { id: true, grandTotal: true, paidAmount: true },
  })
  const returnCreditMap = await loadReturnCreditByInvoiceIdWithClient(
    tx,
    invoices.map((i) => i.id),
  )
  let outstanding = 0
  for (const inv of invoices) {
    const settled = Number(inv.paidAmount ?? 0) + (returnCreditMap.get(inv.id) ?? 0)
    outstanding = safeAdd(outstanding, receivableOutstanding(inv.grandTotal, settled), 2)
  }

  const openOrders = await tx.salesOrder.findMany({
    where: { customerId, status: { in: [...OPEN_ORDER_STATUSES] }, deletedAt: null },
    select: { id: true, grandTotal: true },
  })
  const invoicedByOrder = new Map<number, number>()
  if (openOrders.length > 0) {
    const orderInvoices = await tx.salesInvoice.findMany({
      where: {
        salesOrderId: { in: openOrders.map((o) => o.id) },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { salesOrderId: true, grandTotal: true },
    })
    for (const inv of orderInvoices) {
      if (inv.salesOrderId == null) continue
      invoicedByOrder.set(
        inv.salesOrderId,
        safeAdd(invoicedByOrder.get(inv.salesOrderId) ?? 0, Number(inv.grandTotal), 2),
      )
    }
  }
  let openOrderAmount = 0
  let linkedOrderOpen = 0
  for (const order of openOrders) {
    const open = Math.max(
      0,
      receivableOutstanding(order.grandTotal, invoicedByOrder.get(order.id) ?? 0),
    )
    if (open <= 0) continue
    openOrderAmount = safeAdd(openOrderAmount, open, 2)
    if (attempt.salesOrderId != null && order.id === attempt.salesOrderId) {
      linkedOrderOpen = open
    }
  }

  let confirmedDownPayment = 0
  const confirmedDps = await tx.downPayment.findMany({
    where: { customerId, status: "confirmed" },
    select: { customerId: true, quotationId: true, amount: true },
  })
  if (confirmedDps.length > 0) {
    const dpQuotationIds = [...new Set(confirmedDps.map((d) => d.quotationId))]
    const recognisedDpInvoices = await tx.salesInvoice.findMany({
      where: {
        quotationId: { in: dpQuotationIds },
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { quotationId: true },
    })
    const byCustomer = effectiveConfirmedDownPaymentByCustomer(
      confirmedDps.map((d) => ({
        customerId: d.customerId,
        quotationId: d.quotationId,
        amount: Number(d.amount),
      })),
      new Set(
        recognisedDpInvoices
          .map((i) => i.quotationId)
          .filter((id): id is number => id != null),
      ),
    )
    confirmedDownPayment = byCustomer.get(customerId) ?? 0
  }

  const openCredits = await tx.customerCredit.findMany({
    where: { customerId, status: "open" },
    select: {
      customerId: true,
      receivedAmount: true,
      allocatedAmount: true,
      refundedAmount: true,
    },
  })
  const openCustomerCredit =
    openCustomerCreditByCustomer(
      openCredits.map((c) => ({
        customerId: c.customerId,
        receivedAmount: Number(c.receivedAmount),
        allocatedAmount: Number(c.allocatedAmount),
        refundedAmount: Number(c.refundedAmount),
      })),
    ).get(customerId) ?? 0

  let woUnrepresented = 0
  let linkedQuotationWo = 0
  const activeWorkOrders = await tx.workOrder.findMany({
    where: { customerId, status: { in: [...ACTIVE_WO_STATUSES] } },
    select: { customerId: true, quotationId: true },
  })
  if (activeWorkOrders.length > 0) {
    const woQuotationIds = [
      ...new Set(
        activeWorkOrders
          .map((w) => w.quotationId)
          .filter((id): id is number => id != null),
      ),
    ]
    if (woQuotationIds.length > 0) {
      const [woQuotations, woOrders, woInvoices] = await Promise.all([
        tx.quotation.findMany({
          where: { id: { in: woQuotationIds }, deletedAt: null },
          select: { id: true, customerId: true, grandTotal: true },
        }),
        tx.salesOrder.findMany({
          where: {
            quotationId: { in: woQuotationIds },
            status: { not: "cancelled" },
            deletedAt: null,
          },
          select: { quotationId: true, grandTotal: true },
        }),
        tx.salesInvoice.findMany({
          where: {
            quotationId: { in: woQuotationIds },
            status: { in: [...RECOGNISED_AR_STATUSES] },
            deletedAt: null,
          },
          select: { quotationId: true, grandTotal: true },
        }),
      ])
      const ownQuotations = woQuotations.filter((q) => q.customerId === customerId)
      const result = woUnrepresentedByCustomer({
        workOrders: activeWorkOrders,
        quotations: ownQuotations.map((q) => ({
          id: q.id,
          customerId: q.customerId,
          grandTotal: Number(q.grandTotal),
        })),
        salesOrders: woOrders.map((o) => ({
          quotationId: o.quotationId,
          grandTotal: Number(o.grandTotal),
        })),
        invoices: woInvoices.map((i) => ({
          quotationId: i.quotationId,
          grandTotal: Number(i.grandTotal),
        })),
      })
      woUnrepresented = result.byCustomer.get(customerId) ?? 0
      if (attempt.quotationId != null) {
        const single = woUnrepresentedByCustomer({
          workOrders: activeWorkOrders.filter((w) => w.quotationId === attempt.quotationId),
          quotations: ownQuotations
            .filter((q) => q.id === attempt.quotationId)
            .map((q) => ({
              id: q.id,
              customerId: q.customerId,
              grandTotal: Number(q.grandTotal),
            })),
          salesOrders: woOrders
            .filter((o) => o.quotationId === attempt.quotationId)
            .map((o) => ({
              quotationId: o.quotationId,
              grandTotal: Number(o.grandTotal),
            })),
          invoices: woInvoices
            .filter((i) => i.quotationId === attempt.quotationId)
            .map((i) => ({
              quotationId: i.quotationId,
              grandTotal: Number(i.grandTotal),
            })),
        })
        linkedQuotationWo = single.byCustomer.get(customerId) ?? 0
      }
    }
  }

  return {
    creditLimit,
    outstanding,
    openOrderAmount,
    confirmedDownPayment,
    openCustomerCredit,
    woUnrepresented,
    linkedOrderOpen,
    linkedQuotationWo,
  }
}

/**
 * Nilai tertagih existing satu dokumen (untuk delta update). Dokumen draft
 * belum masuk K1/K2 builder sehingga kontribusinya 0; recognised dihitung
 * sebagai sisa tertagihnya persis seperti loader.
 */
async function existingDocumentExposure(
  tx: Tx,
  attempt: CreditGateAttempt,
): Promise<number> {
  if (attempt.existingDocumentId == null) return 0
  if (attempt.documentType === "sales_order") {
    const order = await tx.salesOrder.findUnique({
      where: { id: attempt.existingDocumentId },
      select: { status: true, grandTotal: true },
    })
    if (!order || !(OPEN_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      return 0
    }
    const invs = await tx.salesInvoice.findMany({
      where: {
        salesOrderId: order ? attempt.existingDocumentId : undefined,
        status: { in: [...RECOGNISED_AR_STATUSES] },
        deletedAt: null,
      },
      select: { grandTotal: true },
    })
    const invoiced = invs.reduce(
      (sum, i) => safeAdd(sum, Number(i.grandTotal), 2),
      0,
    )
    return Math.max(0, receivableOutstanding(order.grandTotal, invoiced))
  }
  const invoice = await tx.salesInvoice.findUnique({
    where: { id: attempt.existingDocumentId },
    select: { status: true, grandTotal: true, paidAmount: true },
  })
  if (!invoice || !(RECOGNISED_AR_STATUSES as readonly string[]).includes(invoice.status)) {
    return 0
  }
  const returnCreditMap = await loadReturnCreditByInvoiceIdWithClient(tx, [
    attempt.existingDocumentId,
  ])
  const settled =
    Number(invoice.paidAmount ?? 0) +
    (returnCreditMap.get(attempt.existingDocumentId) ?? 0)
  return receivableOutstanding(invoice.grandTotal, settled)
}

function projectedRow(
  components: ExposureComponents,
  attempt: CreditGateAttempt,
  existingExposure: number,
) {
  let outstanding = components.outstanding
  let openOrderAmount = components.openOrderAmount
  let woUnrepresented = components.woUnrepresented

  // Keluarkan kontribusi existing dokumen yang diperbarui; delta dinilai
  // terhadap nilai baru di bawah (dokumen tidak ditambah ulang).
  if (attempt.existingDocumentId != null && existingExposure > 0) {
    if (attempt.documentType === "sales_invoice") {
      outstanding = Math.max(0, safeSubtract(outstanding, existingExposure, 2))
    } else {
      openOrderAmount = Math.max(0, safeSubtract(openOrderAmount, existingExposure, 2))
    }
  }

  if (attempt.documentType === "sales_order") {
    // SO dari quotation menggantikan K5 sumber, bukan menumpuk di atasnya.
    if (attempt.quotationId != null && components.linkedQuotationWo > 0) {
      woUnrepresented = Math.max(
        0,
        safeSubtract(woUnrepresented, components.linkedQuotationWo, 2),
      )
    }
    openOrderAmount = safeAdd(openOrderAmount, Math.max(0, attempt.attemptedAmount), 2)
  } else {
    // Invoice dari SO: porsi SO terkait berpindah K2 -> K1, bukan dobel.
    if (attempt.salesOrderId != null && components.linkedOrderOpen > 0) {
      const moved = Math.min(components.linkedOrderOpen, Math.max(0, attempt.attemptedAmount))
      openOrderAmount = Math.max(0, safeSubtract(openOrderAmount, moved, 2))
    }
    // Invoice dari quotation tanpa SO: K5 quotation sumber digantikan.
    if (
      attempt.salesOrderId == null &&
      attempt.quotationId != null &&
      components.linkedQuotationWo > 0
    ) {
      woUnrepresented = Math.max(
        0,
        safeSubtract(woUnrepresented, components.linkedQuotationWo, 2),
      )
    }
    outstanding = safeAdd(outstanding, Math.max(0, attempt.attemptedAmount), 2)
  }

  return buildCustomerCreditExposure([
    {
      customerId: attempt.customerId,
      customerName: "",
      creditLimit: components.creditLimit,
      outstanding,
      overdue: 0,
      invoiceCount: 0,
      openOrderAmount,
      confirmedDownPayment: components.confirmedDownPayment,
      openCustomerCredit: components.openCustomerCredit,
      woUnrepresented,
    },
  ])[0]
}

function blockedMessage(assessment: CustomerCreditGateAssessment): string {
  return (
    `Dokumen tertahan gerbang kredit: ${assessment.statusLabel}. ` +
    `Batas kredit ${formatCurrency(assessment.creditLimit)}, ` +
    `PaparanBersih ${formatCurrency(assessment.exposure)}. ` +
    `Minta persetujuan override batas kredit untuk melanjutkan.`
  )
}

/**
 * Penilaian gerbang di dalam transaksi lahir. Mengembalikan outcome;
 * pemanggil WAJIB menggagalkan transaksinya sendiri bila kind "blocked"
 * (throw) supaya nol baris dokumen lahir (rollback penuh).
 */
export async function assessCreditGateInTx(
  tx: Tx,
  attempt: CreditGateAttempt,
): Promise<CreditGateOutcome> {
  const setting = await tx.systemSetting.findFirst({
    select: { creditGateEnabled: true },
  })
  if (!setting?.creditGateEnabled) return { kind: "gate_off" }

  const now = attempt.now ?? new Date()

  // Serialisasi per pelanggan (EC-CL2-1): kunci baris pelanggan.
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${attempt.customerId} FOR UPDATE`
  const customer = await tx.customer.findUnique({
    where: { id: attempt.customerId },
    select: { deletedAt: true },
  })
  const customerArchived = !customer || customer.deletedAt != null

  const components = await loadComponents(tx, attempt.customerId, attempt)
  const existingExposure = await existingDocumentExposure(tx, attempt)
  const row = projectedRow(components, attempt, existingExposure)
  const assessment = assessCustomerCreditGate(row, { gateEnabled: true })

  if (!assessment.blocked) return { kind: "allowed", assessment }

  const fingerprint = creditAttemptFingerprint(attempt)

  // Pelanggan terarsip: override gugur (EC-CL2-3) — tertahan tanpa rekod baru.
  if (customerArchived) {
    return {
      kind: "blocked",
      assessment,
      overrideId: null,
      overrideStatus: null,
      message: blockedMessage(assessment),
    }
  }

  const candidates = await tx.creditOverride.findMany({
    where: { fingerprint },
    orderBy: { createdAt: "desc" },
  })

  // Pakai: approved cocok sidik -> transisi used sekali dalam tx lahir ini.
  // Penanda used ditulis pemanggil sesudah dokumen lahir (documentId/No);
  // di sini status dikunci lebih dulu supaya pakai kedua gagal.
  const approved = candidates.find(
    (c) => deriveCreditOverrideStatus(c, now) === "approved",
  )
  if (approved) {
    await tx.creditOverride.update({
      where: { id: approved.id },
      data: { status: "used" },
    })
    return { kind: "override_used", assessment, overrideId: approved.id }
  }

  const pending = candidates.find(
    (c) => deriveCreditOverrideStatus(c, now) === "pending",
  )
  if (pending) {
    return {
      kind: "override_pending",
      assessment,
      overrideId: pending.id,
      message: blockedMessage(assessment),
    }
  }

  const reason = attempt.requestReason?.trim()
  if (!reason) {
    return {
      kind: "blocked",
      assessment,
      overrideId: null,
      overrideStatus: null,
      message:
        `${blockedMessage(assessment)} Alasan permintaan override wajib diisi.`,
    }
  }

  const created = await tx.creditOverride.create({
    data: {
      customerId: attempt.customerId,
      documentType: attempt.documentType,
      fingerprint,
      attemptedAmount: attempt.attemptedAmount,
      creditLimit: assessment.creditLimit,
      exposure: assessment.exposure,
      exposureStatus: assessment.status,
      utilization: assessment.utilization,
      quotationId: attempt.quotationId ?? null,
      salesOrderId: attempt.salesOrderId ?? null,
      requestedBy: attempt.requestedBy,
      requestReason: reason,
      status: "pending",
    },
  })
  return {
    kind: "override_pending",
    assessment,
    overrideId: created.id,
    message: blockedMessage(assessment),
  }
}

/** Tandai override used dengan dokumen hasil, dalam tx lahir yang sama. */
export async function markCreditOverrideUsed(
  tx: Tx,
  overrideId: number,
  document: { id: number; documentNo: string | null },
): Promise<void> {
  await tx.creditOverride.update({
    where: { id: overrideId },
    data: {
      usedDocumentId: document.id,
      usedDocumentNo: document.documentNo,
    },
  })
}

/**
 * Penjaga titik lahir: throw pesan tertahan (rollback tx pemanggil) bila
 * outcome menahan. Mengembalikan overrideId yang terpakai (untuk ditandai
 * used sesudah dokumen lahir), atau null.
 */
export function assertCreditGatePassed(outcome: CreditGateOutcome): number | null {
  if (outcome.kind === "blocked" || outcome.kind === "override_pending") {
    throw new Error(outcome.message)
  }
  if (outcome.kind === "override_used") return outcome.overrideId
  return null
}
