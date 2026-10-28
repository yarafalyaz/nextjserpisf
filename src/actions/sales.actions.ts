
"use server"

import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import { activeSalesPaymentWhere } from "@/lib/finance/payment-status"
import { requirePermission } from "@/lib/auth/permissions"
import { safeAdd, safeSubtract, safeMultiply, safeDivide, safeRound } from "@/lib/utils/math"
import { computeQuotationTotals, computeQuotationLine } from "@/lib/sales/quotation-totals"
import { prisma } from "@/lib/db/prisma"
import { toBaseFactor } from "@/lib/services/uom.service"
import { checkIdempotency } from "@/lib/utils/idempotency"
import { onSalesInvoicePosted, onSalesPaymentCreated, onSalesReturnCompleted, onDownPaymentReceived, deleteJournalByReferenceTx, reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"
import {
  bindIdempotencyKey,
  claimIdempotencyKey,
  payloadFingerprint,
} from "@/lib/services/financial-idempotency.service"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { onDownPaymentConfirmed } from "@/lib/hooks/down-payment.hook"
import { onSalesPaymentCreated as onSalesPaymentRecalculate, onSalesPaymentUpdated, onSalesPaymentDeleted } from "@/lib/hooks/sales-payment.hook"
import { onSalesReturnCompleted as onSalesReturnStock } from "@/lib/hooks/sales-return.hook"
import { notificationService } from "@/lib/services/notification.service"
import { resyncOnEdit } from "@/lib/services/quotation-sync.service"
import { isLostReasonCategoryKey } from "@/lib/reports/quotation-outcome"
import { quotationHasRealSettlement, salesOrderHasRealSettlement, hasRealSettlement } from "@/lib/services/sales-settlement.service"
import { computeDifferenceInvoiceCandidate } from "@/lib/reports/job-billing-difference"
import { computeProgressInvoiceCandidate, computeRevisionDownCreditCandidate } from "@/lib/reports/job-billing-progress"
import { reverseSalesInvoicePostingTx } from "@/lib/services/sales-invoice-posting.service"
import { commissionSnapshotForPaid } from "@/lib/services/commission-snapshot"
import { stampQuotationFitmentSnapshot } from "@/lib/services/vehicle-fitment.service"
import { buildInvoiceThresholdInfo } from "@/lib/sales/invoice-threshold"
import { assertInvoiceAllowedForWorkOrderBridges } from "@/lib/services/warranty-journal.service"
import { generateDocumentNumber } from "@/lib/utils/document-number"
import { revalidatePath } from "next/cache"
import { safeJsonParse } from "@/lib/utils/safe-parse"
import { parseFormData } from "@/lib/validations/parse-form"
import { createDownPaymentSchema, createSalesPaymentSchema, createSalesInvoiceSchema, createSalesOrderSchema, createDeliveryOrderSchema, updateDeliveryOrderSchema, createSalesReturnSchema, updateDownPaymentSchema, updateSalesOrderSchema, updateSalesInvoiceSchema, updateSalesPaymentSchema, updateSalesReturnSchema, DELIVERABLE_ORDER_STATUSES, DELIVERABLE_ORDER_STATUS_LABELS, RETURNABLE_INVOICE_STATUSES } from "@/lib/validations/sales.schemas"
import {
  assessCreditGateInTx,
  assertCreditGatePassed,
  consumeApprovedCreditOverrideInTx,
  isCreditGateBlockedError,
  persistCreditGatePending,
} from "@/lib/services/credit-gate.service"

/**
 * F-2026-10-25-035-B fase 3 (fix TEMUAN 6422009586): hasil tertahan yang
 * dikembalikan action sesudah tx lahir rollback. Rekod pending dipersist
 * di tx pendek tersendiri; kegagalan persist tidak mengubah hasil
 * tertahan (dokumen memang tidak lahir) tetapi dicatat di log server.
 */
async function creditGateBlockedResult(e: unknown) {
  if (!isCreditGateBlockedError(e)) return null
  let creditOverrideId: number | null = null
  try {
    creditOverrideId = await persistCreditGatePending(e.outcome)
  } catch (persistError) {
    console.error("[creditGate] persist pending gagal", persistError)
  }
  const a = e.outcome.assessment
  return {
    success: false as const,
    error: e.outcome.message,
    creditOverrideId,
    creditLimit: a.creditLimit,
    creditExposure: a.exposure,
    creditStatus: a.status,
    creditStatusLabel: a.statusLabel,
  }
}
import { findOverReturn } from "@/lib/sales/return-validation"
import { isSettled, SETTLEMENT_TOLERANCE_IDR } from "@/lib/finance/settlement-status"
import { findCumulativeQtyExcess, cumulativeValueExcess } from "@/lib/sales/cumulative-cap"
import { logActivity, reportPostCommitAuditFailure } from "@/lib/services/activity-log.service"
import { requestApprovalIfConfigured, assertApproved } from "@/lib/services/approval-workflow.service"
import { attachPendingTransactionAttachments, deleteTransactionAttachmentsTx, removeAttachmentFiles } from "@/lib/services/transaction-attachment.service"
import { assertMagicBytes } from "@/lib/storage/storage"
import { nextSlug } from "@/lib/utils/slug-db"
import { wibDateToUtcMidnight, getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { parseLocaleNumber } from "@/lib/utils/parse-money"
import { Prisma } from "@prisma/client"
import {
  loadPriceListRows,
  pickPriceListRow,
  resolveLinePricing,
  type PriceSource,
} from "@/lib/services/customer-price-list.service"

export interface PricedLineMeta {
  priceSource?: PriceSource | null
  priceListId?: number | null
  priceListMinQty?: number | null
}

// F-PRICELIST-01 tahap 1: terapkan daftar harga pelanggan ke baris dokumen
// yang dibuat LANGSUNG dari form (bukan hasil konversi penawaran/pesanan —
// baris hasil konversi sudah membawa harga dokumen sumbernya). Harga
// price-list menjadi unitPrice baris; diskon baris manual tetap menimpa di
// atasnya; tanpa baris price-list berlaku, harga kiriman form dipakai apa
// adanya (default aman). Harga SAP tidak dibaca di sini: FIFO menghitung
// HPP sendiri dan peringatan margin tidak pernah memblokir simpan.
async function applyPriceListLines<
  T extends { itemId: number | null; qty: number; unitPrice: number; discount?: number },
>(
  tx: Prisma.TransactionClient,
  customerId: number,
  date: Date,
  lines: readonly T[],
): Promise<(T & PricedLineMeta)[]> {
  const itemIds = lines.map((l) => l.itemId).filter((id): id is number => id != null)
  if (itemIds.length === 0) return [...lines]
  const { customerCategoryId, rows } = await loadPriceListRows(tx, { customerId, itemIds, date })
  if (rows.length === 0) return [...lines]
  return lines.map((line) => {
    if (line.itemId == null) return line
    // F-018: resolusi qty-aware per baris (BR-TIER-01..06), tanpa agregasi.
    const winner = pickPriceListRow(rows, {
      itemId: line.itemId,
      customerCategoryId,
      date,
      qty: line.qty,
    })
    if (winner === null) {
      return { ...line, priceSource: "item_master" as const, priceListId: null, priceListMinQty: null }
    }
    const r = resolveLinePricing({
      qty: line.qty,
      itemPrice: line.unitPrice,
      priceListPrice: winner.price,
      priceListRow: winner,
      manualDiscount: line.discount,
    })
    return {
      ...line,
      unitPrice: r.unitPrice,
      discount: r.discount,
      priceSource: r.priceSource,
      priceListId: r.priceListId,
      priceListMinQty: r.priceListMinQty,
    }
  })
}

// ==================== QUOTATION ACTIONS ====================

// F-36: validUntil disimpan sebagai tengah malam UTC hari kalender WIB.
// Lewat bila hari WIB hari ini sudah sesudah validUntil (validUntil sendiri masih berlaku).
function assertQuotationNotExpired(validUntil: Date | null | undefined) {
  if (!validUntil) return
  if (getWibTodayUtcDate().getTime() > validUntil.getTime()) {
    throw new Error("Masa berlaku penawaran sudah lewat. Revisi atau perpanjang masa berlaku terlebih dahulu.")
  }
}

async function decideQuotation(
  quotationId: number,
  userId: number,
  decision: { status: string; action: string; verb: string; description?: string },
  revisionNumber: number,
) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: decision.status },
    })

    if (tx.quotationHistory) {
      await tx.quotationHistory.create({
        data: {
          quotationId,
          action: decision.action,
          revisionNumber,
          description: decision.description ?? `Penawaran ${decision.verb} oleh pelanggan (revisi v${revisionNumber})`,
          userId,
        },
      })
    }
  })
}

/**
 * F-2026-10-21-016 tahap 1: resolve atribusi penjual opsional.
 * Nilai kosong -> null (dokumen tanpa penjual sah, komisi tak dihitung).
 * Nilai terisi wajib menunjuk Employee aktif belum terhapus; selain itu
 * ditolak agar snapshot tidak menunjuk orang fiktif/nonaktif.
 */
async function resolveSalesEmployeeId(
  tx: Prisma.TransactionClient,
  raw: unknown,
): Promise<number | null> {
  if (raw === null || raw === undefined || raw === "") return null
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw new Error("Penjual (sales) tidak valid")
  const emp = await tx.employee.findFirst({
    where: { id, isActive: true, deletedAt: null },
    select: { id: true },
  })
  if (!emp) throw new Error("Penjual (sales) tidak ditemukan atau sudah nonaktif")
  return emp.id
}

/**
 * F-2026-10-22-065-S: snapshot persen ambang invoice dari kategori pelanggan
 * saat quotation dibuat. Pelanggan/kategori tak ditemukan atau persen
 * kategori tak sah (0/negatif/>100) → null (helper fail-closed ke 50).
 * Master kategori yang berubah sesudahnya TIDAK mengubah snapshot ini.
 */
async function resolveInvoiceThresholdPercent(
  tx: Prisma.TransactionClient,
  customerId: unknown,
): Promise<number | null> {
  const id = Number(customerId)
  if (!Number.isInteger(id) || id <= 0) return null
  const customer = await tx.customer.findFirst({
    where: { id },
    select: { customerCategory: { select: { downPaymentPercent: true } } },
  })
  const pct = customer?.customerCategory?.downPaymentPercent
  if (pct === null || pct === undefined) return null
  const n = Number(pct)
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null
}

export async function createQuotation(formData: FormData) {
  try {
  const user = await requirePermission("create_quotations")

  const raw = formData.get("data") as string
  const data = safeJsonParse(raw) as any
  if (!data) throw new Error("Data penawaran tidak valid")

  const documentNo = await generateDocumentNumber("QUO")
  const slug = await nextSlug("quotation", documentNo)

  // Validate vehicle belongs to the selected customer
  if (data.customerVehicleId && data.customerId) {
    const vehicle = await prisma.customerVehicle.findFirst({
      where: { id: Number(data.customerVehicleId), customerId: Number(data.customerId) },
      select: { id: true },
    })
    if (!vehicle) {
      throw new Error("Kendaraan tidak terdaftar untuk customer ini")
    }
  }

  const { computedSubtotal, headerDiscount, headerTax, computedGrandTotal } = computeQuotationTotals(data)

  const quotation = await prisma.$transaction(async (tx) => {
    // Create sections and items in a single nested write (eliminates loop + N+1 inserts)
    const q = await tx.quotation.create({
      data: {
        documentNo,
        slug,
        // data arrives via safeJsonParse so IDs come in as strings; Prisma's
        // foreign-key fields expect number. Without the cast, a tampered/buggy
        // client submitting "1" makes the WHERE match nothing and silently
        // relinks the quotation to no customer (DB constraint would catch the
        // missing customer, but a truthy string bypasses the null check). Cast
        // at the boundary to keep types honest. Mirrors the updateQuotation
        // pattern at line ~453.
        customerId: (data.customerId
          ? Number(data.customerId)
          : null) as number,
        customerVehicleId: data.customerVehicleId
          ? Number(data.customerVehicleId)
          : null,
        salesEmployeeId: await resolveSalesEmployeeId(tx, data.salesEmployeeId),
        invoiceThresholdPercent: await resolveInvoiceThresholdPercent(tx, data.customerId),
        date: wibDateToUtcMidnight(data.date),
        validUntil: data.validUntil ? wibDateToUtcMidnight(data.validUntil) : null,
        subtotal: computedSubtotal,
        discount: headerDiscount,
        tax: headerTax,
        grandTotal: computedGrandTotal,
        paymentMethod: data.paymentMethod || null,
        shippingMethod: data.shippingMethod || null,
        notes: data.notes || null,
        status: "draft",
        createdBy: Number(user.id),
        sections: quotationSectionsCreate(data, computeQuotationLine),
      },
    })

    if (tx.quotationHistory) {
      await tx.quotationHistory.create({
        data: {
          quotationId: q.id,
          action: "created",
          description: "Penawaran dibuat (Draft)",
          userId: Number(user.id),
        },
      })
    }

    // F-2026-10-22-063-S: snapshot PERINGATAN fitment baris (tak memblokir).
    await stampQuotationFitmentSnapshot(tx, q.id)

    return q
  })

  await logActivity("create", "Quotation", quotation.id, `Membuat penawaran #${quotation.id}`)
  revalidatePath("/penjualan/penawaran")
  return {
    success: true,
    id: quotation.id,
    slug,
    invoiceThreshold: buildInvoiceThresholdInfo(
      quotation.invoiceThresholdPercent == null ? null : Number(quotation.invoiceThresholdPercent),
    ),
  }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function sendQuotation(quotationId: number) {
  try {
  const user = await requirePermission("edit_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "draft") {
    throw new Error("Quotation hanya bisa dikirim dari status draft")
  }

  // Guard: quotation must have at least one item
  const itemCount = await prisma.quotationItem.count({
    where: { section: { quotationId } },
  })
  if (itemCount === 0) {
    throw new Error("Quotation harus memiliki minimal 1 item sebelum dikirim")
  }

  await prisma.$transaction(async (tx) => {
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "sent" },
    })

    if (tx.quotationHistory) {
      await tx.quotationHistory.create({
        data: {
          quotationId,
          action: "sent",
          description: "Penawaran dikirim ke pelanggan",
          userId: Number(user.id),
        },
      })
    }
  })

  // F-37(a): approval generik opt-in — no-op tanpa workflow Quotation aktif.
  await requestApprovalIfConfigured("Quotation", quotationId, Number(user.id))

  await logActivity("send", "Quotation", quotationId, `Mengirim penawaran #${quotationId}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[sendQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function acceptQuotation(quotationId: number) {
  try {
  const user = await requirePermission("confirm_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "sent") {
    throw new Error("Quotation hanya bisa di-accept dari status sent")
  }

  assertQuotationNotExpired(quotation.validUntil)
  // F-37(a): no-op tanpa workflow/approval Quotation.
  await assertApproved("Quotation", quotationId)

  await decideQuotation(quotationId, Number(user.id), { status: "accepted", action: "accepted", verb: "diterima" }, quotation.revisionNumber)

  // Notify admins
  await notificationService.notifyAdmins('Penawaran diterima pelanggan', `/penjualan/penawaran/${quotationId}`)

  await logActivity("accept", "Quotation", quotationId, `Menerima penawaran #${quotationId}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[acceptQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function rejectQuotation(quotationId: number, reason?: string) {
  // F-38(a): alasan opsional, teks bebas ke QuotationHistory; tanpa migrasi.
  const rawReason = typeof reason === "string" ? reason.trim() : ""
  // F-2026-10-20-101 tahap server: awalan [kalah:<key>] yang dikirim UI
  // wajib memakai kamus quotation-outcome. Key tak dikenal ditolak agar
  // tidak lolos diam-diam lalu jatuh ke ember `tak-tercatat` di laporan
  // (mencemari agregasi). Awalan SATU-satunya yang dilepas dari teks —
  // awalan kedua di tengah teks bebas adalah isi bebas biasa, dan
  // buildQuotationOutcomeSummary membaca awalan SAH pertama.
  const prefixMatch = /^\[kalah:([a-z-]+)\]/.exec(rawReason)
  if (prefixMatch && !isLostReasonCategoryKey(prefixMatch[1])) {
    return { success: false, error: "Kategori alasan kalah tidak dikenal" }
  }
  const cleanReason = rawReason.slice(0, 2000)
  try {
  const user = await requirePermission("confirm_quotations")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  if (quotation.status !== "sent") {
    throw new Error("Hanya penawaran terkirim yang dapat ditolak")
  }

  await decideQuotation(
    quotationId,
    Number(user.id),
    {
      status: "rejected",
      action: "rejected",
      verb: "ditolak",
      ...(cleanReason
        ? { description: `Penawaran ditolak oleh pelanggan (revisi v${quotation.revisionNumber}) — Alasan: ${cleanReason}` }
        : {}),
    },
    quotation.revisionNumber,
  )

  await logActivity("reject", "Quotation", quotationId, `Menolak penawaran #${quotationId}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[rejectQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function reviseQuotation(quotationId: number, changeReason: string) {
  try {
  const user = await requirePermission("edit_quotations")

  // Validasi Zod: changeAlasan diteruskan mentah setelah trim, max 2000.
  const { reviseQuotationSchema } = await import("@/lib/validations/sales.schemas")
  const parsed = reviseQuotationSchema.safeParse({ changeReason })
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Alasan perubahan wajib diisi"
    throw new Error(msg)
  }
  const cleanReason = parsed.data.changeReason

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })

  if (quotation.status !== "sent") {
    throw new Error("Hanya penawaran terkirim yang dapat direvisi")
  }

  const snapshot = {
    grandTotal: quotation.grandTotal,
    subtotal: quotation.subtotal,
    discount: quotation.discount,
    tax: quotation.tax,
    sections: quotation.sections,
  }

  await prisma.$transaction(async (tx) => {
    await tx.quotationHistory.create({
      data: {
        quotationId,
        revisionNumber: quotation.revisionNumber,
        statusAtSnapshot: quotation.status,
        dataSnapshot: snapshot,
        changeReason: cleanReason,
        action: "revised",
        description: `Revisi #${quotation.revisionNumber} — ${cleanReason}`,
        userId: Number(user.id),
      },
    })

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        status: "draft",
        revisionNumber: { increment: 1 },
      },
    })
  })

  await resyncOnEdit(quotationId, Number(user.id))

  await logActivity("revise", "Quotation", quotationId, `Merevisi penawaran #${quotationId}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[reviseQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function convertQuotationToOrder(quotationId: number) {
  try {
  const user = await requirePermission("create_sales_orders")

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
    include: { sections: { include: { items: true } } },
  })

  if (!["accepted", "approved"].includes(quotation.status)) {
    throw new Error("Hanya penawaran approved/accepted yang dapat dikonversi")
  }

  assertQuotationNotExpired(quotation.validUntil)
  await assertApproved("Quotation", quotationId)

  const documentNo = await generateDocumentNumber("SO")
  const slug = await nextSlug("salesOrder", documentNo)
  const allItems = quotation.sections.flatMap((section) => section.items)

  const salesOrder = await prisma.$transaction(async (tx) => {
    // Serialize concurrent converts for the SAME quotation by locking the
    // quotation row. Without this, two simultaneous requests both pass the
    // findFirst idempotency check (TOCTOU) and create two SOs from one
    // quotation. A DB unique on SalesOrder.quotationId is NOT used here because
    // void-and-reissue legitimately keeps a cancelled row pointing at the same
    // quotation, and MySQL has no partial/filtered unique index. The row lock
    // makes the check-then-create atomic without that regression.
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`;
    const existing = await tx.salesOrder.findFirst({ where: { quotationId } })
    if (existing) {
      throw new Error("Penawaran ini sudah memiliki Pesanan Penjualan")
    }

    // F-2026-10-25-035-B titik tahan Q-CL2-4: nilai SEBELUM baris lahir;
    // tertahan = throw = rollback penuh (nol SO lahir).
    const convertAttempt = {
      customerId: quotation.customerId,
      documentType: "sales_order" as const,
      attemptedAmount: Number(quotation.grandTotal),
      requestedBy: Number(user.id),
      quotationId: quotation.id,
      // Jalur tanpa FormData: tanpa alasan -> tanpa rekod pending
      // (fase 3 mengembalikan null); approved bersidik sama tetap
      // bisa dipakai lewat fase 2 di bawah.
      requestReason: null,
    }
    const convertOverrideId = assertCreditGatePassed(
      await assessCreditGateInTx(tx, convertAttempt),
    )

    const so = await tx.salesOrder.create({
      data: {
        documentNo,
        slug,
        customerId: quotation.customerId,
        quotationId: quotation.id,
        customerVehicleId: quotation.customerVehicleId,
        salesEmployeeId: quotation.salesEmployeeId,
        date: new Date(),
        subtotal: quotation.subtotal,
        discount: quotation.discount ?? 0,
        tax: quotation.tax ?? 0,
        grandTotal: quotation.grandTotal,
        totalAmount: quotation.grandTotal,
        status: "draft",
        notes: `Otomatis dibuat dari Quotation ${quotation.documentNo}`,
        createdBy: Number(user.id),
      },
    })

    if (allItems.length > 0) {
      await tx.salesOrderItem.createMany({
        data: allItems.map((item) => ({
          salesOrderId: so.id,
          itemId: item.itemId,
          description: item.description,
          qty: item.qty,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.total,
        })),
      })
    }

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "converted" },
    })

    if (convertOverrideId != null) {
      await consumeApprovedCreditOverrideInTx(tx, convertOverrideId, convertAttempt, {
        id: so.id,
        documentNo: so.documentNo,
      })
    }

    return so
  })

  await logActivity("convert", "Quotation", quotationId, `Konversi penawaran #${quotationId} ke Pesanan Penjualan #${salesOrder.id}`)
  revalidatePath("/penjualan/penawaran")
  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[convertQuotationToOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateQuotation(quotationId: number, formData: FormData) {
  try {
  const user = await requirePermission("edit_quotations")

  const raw = formData.get("data") as string
  const data = safeJsonParse(raw) as any
  if (!data) return { success: false, error: "Data penawaran tidak valid" }

  const quotation = await prisma.quotation.findUniqueOrThrow({
    where: { id: quotationId },
  })

  const slug = await nextSlug("quotation", quotation.documentNo, { excludeId: quotationId })

  // Custom fabrication: the item list may change until the customer actually
  // pays. A converted quotation (DP confirmed → SO/invoice already created) is
  // still editable while the only money received is a down payment; it locks
  // only once a real (non-DP) payment exists on a linked invoice.
  if (quotation.status === "cancelled") {
    throw new Error("Penawaran yang sudah dibatalkan tidak bisa diedit")
  }
  if (await quotationHasRealSettlement(quotationId)) {
    throw new Error("Penawaran sudah ada pelunasan, item tidak bisa diubah lagi")
  }

  // Validate vehicle belongs to customer if both are provided
  const updCustomerId = data.customerId ?? quotation.customerId
  const updVehicleId = data.customerVehicleId ? Number(data.customerVehicleId) : null
  if (updVehicleId && updCustomerId) {
    const vehicle = await prisma.customerVehicle.findFirst({
      where: { id: updVehicleId, customerId: Number(updCustomerId) },
      select: { id: true },
    })
    if (!vehicle) {
      throw new Error("Kendaraan tidak terdaftar untuk customer ini")
    }
  }

  const { computedSubtotal, headerDiscount, headerTax, computedGrandTotal } = computeQuotationTotals(data)

  await prisma.$transaction(async (tx) => {
    // Replace sections + items wholesale: the edit form sends the full section
    // tree, so delete the existing rows and recreate from the payload. Item IDs
    // are not referenced elsewhere (resyncOnEdit re-reads + re-flattens), so
    // regenerating them is safe.
    const existingSections = await tx.quotationSection.findMany({
      where: { quotationId },
      select: { id: true },
    })
    const existingSectionIds = existingSections.map((s) => s.id)
    if (existingSectionIds.length) {
      await tx.quotationItem.deleteMany({ where: { sectionId: { in: existingSectionIds } } })
    }
    await tx.quotationSection.deleteMany({ where: { quotationId } })

    await tx.quotation.update({
      where: { id: quotationId },
      data: {
        slug,
        // data arrives via safeJsonParse so IDs come in as strings; Prisma's
        // foreign-key fields expect number. Without the cast, a tampered/buggy
        // client submitting "1" makes the WHERE match nothing and silently
        // relinks the quotation to no customer (DB constraint would catch the
        // missing customer, but a truthy string bypasses the null check). Cast
        // at the boundary to keep types honest.
        customerId: data.customerId
          ? Number(data.customerId)
          : quotation.customerId,
        customerVehicleId: data.customerVehicleId
          ? Number(data.customerVehicleId)
          : null,
        date: data.date ? wibDateToUtcMidnight(data.date) : undefined,
        validUntil: data.validUntil ? wibDateToUtcMidnight(data.validUntil) : null,
        subtotal: computedSubtotal,
        discount: headerDiscount,
        tax: headerTax,
        grandTotal: computedGrandTotal,
        paymentMethod: data.paymentMethod || null,
        shippingMethod: data.shippingMethod || null,
        notes: data.notes || null,
        sections: quotationSectionsCreate(data, computeQuotationLine),
      },
    })

    // F-2026-10-22-063-S: evaluasi ulang snapshot fitment tiap simpan.
    await stampQuotationFitmentSnapshot(tx, quotationId)
  })

  // Re-sync linked SO/Invoice items
  await resyncOnEdit(quotationId, Number(user.id))

  await logActivity("update", "Quotation", quotationId, `Memperbarui penawaran #${quotationId}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true, slug }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DOWN PAYMENT ACTIONS ====================

export async function createDownPayment(formData: FormData) {
  try {
  const user = await requirePermission("create_down_payments")

  const parsed = parseFormData(createDownPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("DP")
  const slug = await nextSlug("downPayment", documentNo)

  const proofImage: string | null = await saveDownPaymentProof(formData)

  const quotationId = v.quotationId
  const amount = v.amount

  // Quotation TOCTOU guard: baca luar-tx dihapus. Status + grandTotal dibaca
  // ulang DALAM tx setelah FOR UPDATE — pesaing bisa membatalkan/menolak
  // quotation di antara baca luar dan tulis. Cap kumulatif tetap dalam tx yang
  // sama (lock yang sama menutup keduanya).

  // Lock the quotation row + re-run the cumulative cap INSIDE the transaction so
  // two concurrent DP creations on the same quotation can't each pass the cap
  // (TOCTOU) and together over-pay the quotation grandTotal. Mirrors the
  // convertQuotationToOrder / createVendorBill lock pattern. The GL hook
  // (onDownPaymentReceived) was previously called AFTER commit — if the journal
  // post failed (closed period, misconfigured account) the DP row stayed in
  // draft while the rest of the system moved on, leaving a "phantom" DP with
  // no GL trace. Move it INSIDE the tx and pass tx so a failed post rolls
  // back the DP insert.
    const dp = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

      const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } })
      if (!["accepted", "approved", "converted"].includes(quotation.status)) {
        throw new Error("DP hanya bisa dibuat untuk quotation approved/accepted/converted")
      }

      const existingDPs = await tx.downPayment.aggregate({
        where: { quotationId, status: { not: "cancelled" } },
        _sum: { amount: true },
      })
      const totalExisting = Number(existingDPs._sum.amount ?? 0)
      if (totalExisting + amount > Number(quotation.grandTotal)) {
        throw new Error(`Total DP melebihi nilai quotation (sisa: ${Number(quotation.grandTotal) - totalExisting})`)
      }

      const created = await tx.downPayment.create({
        data: {
          documentNo,
          slug,
          quotationId,
          customerId: quotation.customerId,
          amount,
          paymentDate: wibDateToUtcMidnight(v.paymentDate),
          paymentMethod: v.paymentMethod ?? null,
          proofImage,
          notes: v.notes ?? null,
          status: "draft",
          createdBy: Number(user.id),
        },
      })

      // P0-1: pencatatan DP berhenti di `draft`. Verifikasi penerimaan
      // (jurnal kas) + konfirmasi (WO/SO/Project, invoice bila ambang 50%)
      // terjadi eksplisit lewat confirmDownPayment — bukan otomatis di sini.
      // Sebelumnya kedua hook dipanggil dalam tx yang sama sehingga DP
      // sekecil apa pun langsung menjadi invoice POSTED + stock-out.

      return created
    })

    await logActivity("create", "DownPayment", dp.id, `Membuat uang muka #${dp.id}`)
    revalidatePath("/penjualan/uang-muka")
    return { success: true, id: dp.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * AUD-R3-03: alokasi saldo kredit pelanggan ke faktur lain.
 * Izin = confirm_down_payments (gerbang yang sama dengan konfirmasi DP —
 * kredit lahir dari DP). Service mengunci baris + tolak over-saldo/sisa.
 */
/**
 * AUD-R10-03: helper upload bukti bayar DP (dedup 2 blok identik create/update).
 * Cap 5MB + whitelist ekstensi + magic-bytes SEBELUM tulis (anti Stored XSS
 * via public/uploads). Return path public atau null bila tak ada file.
 */
/**
 * AUD-R10-03: helper sections-create quotation (dedup create/update).
 * Cast itemId string→number di boundary + clamp via computeLine pemanggil.
 */
function quotationSectionsCreate(data: any, computeLine: (item: any) => { discountAmount: number; total: number }) {
  return {
    create: (data.sections || []).map((section: any, si: number) => ({
      name: section.name || `Section ${si + 1}`,
      sortOrder: si,
      items: {
        create: (section.items || []).map((item: any, ii: number) => {
          const { discountAmount, total } = computeLine(item)
          return {
            // itemId string dari safeJsonParse → number FK; "abc"/null tak
            // boleh tulis string ke kolom Int.
            itemId: item.itemId ? Number(item.itemId) : null,
            description: item.description || null,
            qty: Number(item.qty) || 1,
            uom: item.uom || null,
            unitPrice: Number(item.unitPrice) || 0,
            discount: discountAmount,
            total,
            sortOrder: ii,
          }
        }),
      },
    })),
  }
}

async function saveDownPaymentProof(formData: FormData): Promise<string | null> {
  const proofFile = formData.get("proofImage")
  if (!(proofFile && proofFile instanceof File && proofFile.size > 0)) return null
  // Cap proof uploads at 5 MB — payment screenshots/photos, bukan raw images.
  const MAX_PROOF_BYTES = 5 * 1024 * 1024
  if (proofFile.size > MAX_PROOF_BYTES) {
    throw new Error(`Ukuran bukti bayar melebihi batas maksimum ${MAX_PROOF_BYTES / 1024 / 1024}MB.`)
  }
  // Whitelist ekstensi aman untuk public/ (tolak .html/.svg → Stored XSS).
  const rawExt = (proofFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "")
  const allowedExts = new Set(["jpg", "jpeg", "png", "webp", "pdf"])
  const ext = allowedExts.has(rawExt.toLowerCase()) ? rawExt.toLowerCase() : "jpg"

  const { writeFile, mkdir } = await import("fs/promises")
  const path = await import("path")
  const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs")
  await mkdir(uploadDir, { recursive: true })
  const filename = `proof-dp-${Date.now()}.${ext}`
  const filepath = path.join(uploadDir, filename)
  const bytes = await proofFile.arrayBuffer()
  const buffer = Buffer.from(bytes)
  // Tolak isi tak cocok ekstensi SEBELUM tulis (File.type/nama bisa dipalsukan).
  assertMagicBytes(buffer, ext === "pdf" ? "application/pdf" : `image/${ext === "jpg" ? "jpeg" : ext}`)
  await writeFile(filepath, buffer)
  return `/uploads/proofs/${filename}`
}

export async function allocateCustomerCredit(creditId: number, salesInvoiceId: number, amount: number, idempotencyKey?: string) {
  const { allocateCreditToInvoice } = await import("@/lib/services/customer-credit.service");
  try {
    const user = await requirePermission("confirm_down_payments");
    const result = await allocateCreditToInvoice(creditId, salesInvoiceId, amount, Number(user.id), idempotencyKey);
    // AUD-R8-01: teruskan flag ambigu — UI buang key HANYA bila definitif.
    if (!result.success) return { success: false as const, error: result.error, ambiguous: result.ambiguous === true };
    // AUD-R5-03: finansial SUDAH commit. Kegagalan audit dicatat via helper
    // (baris AUDIT_FAILURE + console berkonteks) — transaksi tetap success.
    let auditWarning: string | undefined;
    try {
      await logActivity("allocate", "CustomerCredit", creditId, `Alokasi kredit ${amount} ke faktur #${salesInvoiceId}`);
    } catch (e) {
      const r = await reportPostCommitAuditFailure("allocate", "CustomerCredit", creditId, e instanceof Error ? e.message : String(e));
      // Penanda dikonsumsi: kegagalan jejak MUNCUL di respons (warning),
      // bukan hilang. Transaksi uang tetap sah.
      if (!r.auditPersisted) auditWarning = "Alokasi sah, tetapi jejak audit gagal dicatat — hubungi admin.";
    }
    revalidatePath("/penjualan/faktur");
    // AUD-R7-03: bedakan operasi baru vs replay retry (UI tampilkan bukti ID).
    return { success: true as const, warning: auditWarning, replayed: result.replayed === true, paymentId: result.paymentId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

/**
 * AUD-R3-03: refund sisa kredit pelanggan ke kas (Dr 210102 / Cr Kas).
 * Izin = confirm_down_payments. Service menolak melebihi saldo.
 */
export async function refundCustomerCredit(creditId: number, amount: number, idempotencyKey?: string) {
  const { refundCredit } = await import("@/lib/services/customer-credit.service");
  try {
    const user = await requirePermission("confirm_down_payments");
    const result = await refundCredit(creditId, amount, Number(user.id), idempotencyKey);
    if (!result.success) return { success: false as const, error: result.error, ambiguous: result.ambiguous === true };
    // AUD-R5-03: sama — refund sudah commit; audit gagal = jejak, bukan error.
    let refundAuditWarning: string | undefined;
    try {
      await logActivity("refund", "CustomerCredit", creditId, `Refund kredit ${amount} ke kas`);
    } catch (e) {
      const r = await reportPostCommitAuditFailure("refund", "CustomerCredit", creditId, e instanceof Error ? e.message : String(e));
      if (!r.auditPersisted) refundAuditWarning = "Refund sah, tetapi jejak audit gagal dicatat — hubungi admin.";
    }
    revalidatePath("/penjualan/faktur");
    return { success: true as const, warning: refundAuditWarning, replayed: result.replayed === true, journalId: result.journalId };
  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e;
    return { success: false as const, error: getErrorMessage(e, "Terjadi kesalahan") };
  }
}

export async function confirmDownPayment(dpId: number) {
  try {
  const user = await requirePermission("confirm_down_payments")

  // P0-1: dua tahap verifikasi dalam satu transaksi atomik —
  // (1) terima: jurnal kas/bank vs uang muka (idempoten, gagal = rollback);
  // (2) konfirmasi: WO/SO/Project + invoice bila kumulatif terverifikasi
  // mencapai 50% nilai quotation.
  await prisma.$transaction(async (tx) => {
    // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 4: nilai SEKALI di hulu
    // sebelum rantai DP. Hasil idempoten (DP sudah confirmed / invoice
    // existing) TIDAK ditahan. Tertahan = throw = seluruh tx DP rollback.
    const dpGate = await tx.downPayment.findUnique({
      where: { id: dpId },
      select: {
        status: true,
        customerId: true,
        quotationId: true,
        quotation: { select: { grandTotal: true } },
      },
    })
    if (dpGate && dpGate.status !== "confirmed") {
      const existingInvGate = await tx.salesInvoice.findFirst({
        where: { quotationId: dpGate.quotationId, status: { not: "cancelled" } },
        select: { id: true },
      })
      if (!existingInvGate) {
        // Tanpa alasan (jalur DP): tertahan tanpa rekod pending
        // (fase 3 -> null). assert juga melempar bila ada approved
        // bersidik sama dari jalur beralasan — overrideId-nya sengaja
        // tidak dipakai di sini: dokumen hasil DP lahir dari hook
        // konfirmasi rantai, bukan satu dokumen tertagih langsung di
        // tx ini, jadi penandaan used tidak punya dokumen pasangan;
        // menahan ulang adalah perilaku fail-closed yang benar.
        assertCreditGatePassed(
          await assessCreditGateInTx(tx, {
            customerId: dpGate.customerId,
            documentType: "sales_invoice",
            attemptedAmount: Number(dpGate.quotation.grandTotal),
            requestedBy: Number(user.id),
            quotationId: dpGate.quotationId,
            requestReason: null,
          }),
        )
      }
    }
    await onDownPaymentReceived(dpId, Number(user.id), tx)
    await onDownPaymentConfirmed(dpId, Number(user.id), tx)
  })

  await logActivity("confirm", "DownPayment", dpId, `Konfirmasi uang muka #${dpId}`)
  revalidatePath("/penjualan/uang-muka")
  revalidatePath("/penjualan/faktur")
  revalidatePath("/penjualan/pesanan")
  revalidatePath("/produksi/perintah-kerja")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[confirmDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== SALES ORDER ACTIONS ====================

export async function createSalesOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_orders")

  const idempotencyKey = formData.get("idempotencyKey") as string | null

  const parsed = parseFormData(createSalesOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("SO")
  const slug = await nextSlug("salesOrder", documentNo)

  const salesOrder = await prisma.$transaction(async (tx) => {
    await checkIdempotency(idempotencyKey, tx, user.id)

    // Satu penawaran hanya boleh menghasilkan SATU pesanan penjualan. Tanpa
    // penjagaan ini, tombol "+ Pesanan Penjualan" di halaman penawaran bisa
    // diklik dua kali (atau URL ?quotationId= dipakai ulang) dan lahir dua SO
    // dari satu penawaran. Kunci baris penawaran membuat cek-lalu-buat ini
    // atomik — sama seperti convertQuotationToOrder, yang sekarang memakai
    // aturan yang sama supaya kedua jalur tidak berbeda perilaku.
    if (v.quotationId) {
      await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${v.quotationId} FOR UPDATE`
      const sudahAda = await tx.salesOrder.findFirst({
        where: { quotationId: v.quotationId },
        select: { documentNo: true },
      })
      if (sudahAda) {
        throw new Error(
          `Penawaran ini sudah memiliki Pesanan Penjualan ${sudahAda.documentNo}`,
        )
      }
    }

    // Item penawaran disalin sebagai NILAI AWAL, bukan dikunci. Produksi ini
    // fabrikasi: spesifikasi bisa berubah setelah DP masuk/keluar dan pesanan
    // tetap boleh direvisi lewat InvoiceItemsEditor di halaman detail.
    // Sebelum ini pesanan hasil konversi lahir dengan tabel item KOSONG.
    let quotationItems: Array<{
      itemId: number | null
      description: string | null
      qty: number
      unitPrice: number
      discount: number
      total: number
    }> = []
    let quotationTaxRate = 0
    let quotationSalesEmployeeId: number | null = null

    if (v.quotationId) {
      const quotation = await tx.quotation.findUnique({
        where: { id: v.quotationId },
        include: { sections: { include: { items: true } } },
      })
      if (quotation) {
        quotationSalesEmployeeId = quotation.salesEmployeeId
        // Gerbang yang sama dengan convertQuotationToOrder: jalur form tidak
        // boleh menjadi jalan pintas mengonversi penawaran konsep/ditolak/
        // kedaluwarsa yang jalur resminya menolak.
        if (!["accepted", "approved"].includes(quotation.status)) {
          throw new Error("Hanya penawaran approved/accepted yang dapat dikonversi")
        }
        assertQuotationNotExpired(quotation.validUntil)
        await assertApproved("Quotation", v.quotationId)
        quotationItems = quotation.sections.flatMap((section) =>
          section.items.map((item) => ({
            itemId: item.itemId,
            description: item.description,
            qty: Number(item.qty),
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount),
            total: Number(item.total),
          })),
        )
        const dasarPengenaan = safeSubtract(Number(quotation.subtotal), Number(quotation.discount), 0)
        quotationTaxRate = dasarPengenaan > 0
          ? safeDivide(safeMultiply(Number(quotation.tax), 100, 4), dasarPengenaan, 4)
          : 0
      }
    }

    const subtotal = quotationItems.reduce((sum, item) => safeAdd(sum, item.total, 0), 0)
    const discountTotal = Math.min(Math.max(0, Number(v.discount ?? 0)), subtotal)
    const taxRate = Math.max(0, Number(v.taxRate ?? quotationTaxRate) || 0)
    const taxAmount = safeRound(safeDivide(safeMultiply(safeSubtract(subtotal, discountTotal, 0), taxRate, 4), 100, 4), 0)
    const grandTotal = safeSubtract(safeAdd(subtotal, taxAmount, 0), discountTotal, 0)

    // F-2026-10-25-035-B titik tahan Q-CL2-4: nilai SEBELUM baris lahir;
    // tertahan = CreditGateBlockedError = rollback (nol SO lahir);
    // rekod pending dipersist action di fase 3 sesudah rollback.
    const soAttempt = {
      customerId: v.customerId,
      documentType: "sales_order" as const,
      attemptedAmount: grandTotal,
      requestedBy: Number(user.id),
      quotationId: v.quotationId ?? null,
      requestReason: v.creditOverrideReason ?? null,
    }
    const soOverrideId = assertCreditGatePassed(
      await assessCreditGateInTx(tx, soAttempt),
    )

    const createdOrder = await tx.salesOrder.create({
      data: {
        documentNo,
        slug,
        customerId: v.customerId,
        quotationId: v.quotationId ?? null,
        salesEmployeeId: quotationSalesEmployeeId,
                date: wibDateToUtcMidnight(v.date),
        deliveryDate: v.deliveryDate ? wibDateToUtcMidnight(v.deliveryDate) : null,
        notes: v.notes ?? null,
        status: "draft" as const,
        createdBy: Number(user.id),
        subtotal,
        discount: discountTotal,
        tax: taxAmount,
        grandTotal,
        totalAmount: grandTotal,
        ...(quotationItems.length > 0
          ? {
              items: {
                create: quotationItems.map((item) => ({
                  itemId: item.itemId,
                  description: item.description,
                  qty: item.qty,
                  unitPrice: item.unitPrice,
                  discount: item.discount,
                  total: item.total,
                })),
              },
            }
          : {}),
      },
    })
    if (soOverrideId != null) {
      await consumeApprovedCreditOverrideInTx(tx, soOverrideId, soAttempt, {
        id: createdOrder.id,
        documentNo: createdOrder.documentNo,
      })
    }
    return createdOrder
  })

  await logActivity("create", "SalesOrder", salesOrder.id, `Membuat pesanan penjualan #${salesOrder.id}`)
  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id, slug }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[createSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function postInvoice(invoiceId: number) {
  try {
  const user = await requirePermission("post_sales_invoices")

  const invoice = await prisma.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  })

  // Approval workflow gate: if a SalesInvoice workflow is configured, it must
  // be fully approved before posting. This check is done after loading the
  // invoice so we have the context (but assertApproved only uses IDs internally).
  await assertApproved("SalesInvoice", invoiceId);

  if (invoice.status !== "draft" && invoice.status !== "approved") {
    throw new Error("Invoice hanya bisa di-post dari status draft atau approved")
  }

  const itemCount = await prisma.salesInvoiceItem.count({ where: { salesInvoiceId: invoiceId } })
  if (itemCount === 0) {
    throw new Error("Invoice tidak memiliki item")
  }

  // Atomically claim the post and post GL journal in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Gerbang invoiceForbidden garansi (F-021 tahap 3 G5): WO repair klaim
    // covered tidak boleh diposting menjadi tagihan pelanggan.
    await assertInvoiceAllowedForWorkOrderBridges(tx, {
      quotationId: invoice.quotationId,
      projectId: invoice.projectId,
      salesOrderId: invoice.salesOrderId,
    })

    // TASK-016 BUG-06: posting adalah gerbang terakhir cap kumulatif SO —
    // faktur draft yang lahir sebelum cap ada (atau diedit melewati sisa)
    // tidak boleh memposting jurnal/stok melebihi pesanan. Nilai segar
    // dibaca ulang di dalam tx; faktur ini dikeluarkan dari total berjalan.
    if (invoice.salesOrderId) {
      const fresh = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: { grandTotal: true },
      })
      const ownItems = await tx.salesInvoiceItem.findMany({
        where: { salesInvoiceId: invoiceId },
        select: { itemId: true, qty: true, uom: true },
      })
      await assertInvoiceWithinSalesOrderCap(tx, {
        salesOrderId: invoice.salesOrderId,
        excludeInvoiceId: invoiceId,
        candidateGrandTotal: Number(fresh.grandTotal),
        candidateLines: ownItems.map((line) => ({
          itemId: line.itemId,
          qty: Number(line.qty),
          uom: line.uom,
        })),
      })
    }

    // Claim from EITHER "draft" or "approved". When a SalesInvoice approval
    // workflow is configured, approval.actions sets the document status to
    // "approved" (not "draft"), so a draft-only claim could never match and
    // every workflow-approved invoice would fail to post with a misleading
    // "sudah di-post" error. The status guard above already restricts us to
    // these two states, so matching both is safe and idempotent (a second
    // concurrent request finds neither state and gets count === 0).
    const claim = await tx.salesInvoice.updateMany({
      where: { id: invoiceId, status: { in: ["draft", "approved"] } },
      data: { status: "posted" },
    })
    if (claim.count === 0) {
      throw new Error("Invoice sudah di-post atau sedang diproses.")
    }

    // K5: nomor INV diterbitkan hanya di transisi ini, di dalam tx klaim,
    // supaya dua posting bersamaan tidak berbagi nomor dan draft yang gagal
    // posting tidak membakar nomor. Faktur pra-migrasi yang sudah bernomor
    // TIDAK diterbitkan ulang. Slug mengikuti nomor baru (sebelumnya null).
    if (!invoice.documentNo) {
      const documentNo = await generateDocumentNumber("INV")
      const slug = await nextSlug("salesInvoice", documentNo, { excludeId: invoiceId })
      await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: { documentNo, slug },
      })
    }

    // Trigger accounting hook (replaces Laravel Observer) — runs once, guarded by
    // the atomic claim above so only the winning request reaches here.
    await onSalesInvoicePosted(invoiceId, Number(user.id), tx)
  })

  await logActivity("post", "SalesInvoice", invoiceId, `Posting faktur penjualan #${invoiceId}`)
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[postInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

type QuotationInvoiceRow = { id: number; status: string; grandTotal: number }

/** Kumpul faktur non-terhapus lewat 3 jembatan quotation→invoice, dedup per id. */
async function collectQuotationInvoices(
  tx: Prisma.TransactionClient,
  quotationId: number,
): Promise<QuotationInvoiceRow[]> {
  const [salesOrders, workOrders, directInvoices] = await Promise.all([
    tx.salesOrder.findMany({ where: { quotationId, deletedAt: null }, select: { id: true } }),
    tx.workOrder.findMany({ where: { quotationId }, select: { projectId: true } }),
    tx.salesInvoice.findMany({
      where: { quotationId, deletedAt: null },
      select: { id: true, status: true, grandTotal: true },
    }),
  ])
  const salesOrderIds = salesOrders.map((s) => s.id)
  const projectIds = [...new Set(workOrders.map((w) => w.projectId).filter((p): p is number => p !== null))]
  const [viaSalesOrder, viaProject] = await Promise.all([
    salesOrderIds.length === 0
      ? Promise.resolve([])
      : tx.salesInvoice.findMany({
          where: { salesOrderId: { in: salesOrderIds }, deletedAt: null },
          select: { id: true, status: true, grandTotal: true },
        }),
    projectIds.length === 0
      ? Promise.resolve([])
      : tx.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: { id: true, status: true, grandTotal: true },
        }),
  ])
  const byId = new Map<number, QuotationInvoiceRow>()
  for (const inv of [...directInvoices, ...viaSalesOrder, ...viaProject]) {
    byId.set(inv.id, { id: inv.id, status: inv.status, grandTotal: Number(inv.grandTotal) })
  }
  return [...byId.values()]
}

/**
 * TASK-016 BUG-06: cap kumulatif faktur terhadap Pesanan Penjualan.
 *
 * Nilai: Σ grandTotal faktur non-batal atas SO yang sama (draft ikut
 * memesan porsi — definisi job-billing) + kandidat tidak boleh menembus
 * SO.grandTotal. Kuantitas: per itemId dalam SATUAN DASAR (uom baris
 * faktur dikonversi lewat toBaseFactor; baris SO selalu satuan dasar).
 * Baris jasa (itemId null) tak punya padanan qty — ia tertahan cap nilai.
 * Wajib dipanggil di dalam transaksi; baris SO dikunci FOR UPDATE (dan
 * baris quotation induknya, meniru jalur faktur progres) supaya dua
 * pembuatan/posting bersamaan tidak sama-sama lolos cap.
 */
async function assertInvoiceWithinSalesOrderCap(
  tx: Prisma.TransactionClient,
  input: {
    salesOrderId: number
    excludeInvoiceId?: number
    candidateGrandTotal: number
    candidateLines: Array<{ itemId: number | null; qty: number; uom?: string | null }>
  },
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${input.salesOrderId} FOR UPDATE`
  const so = await tx.salesOrder.findUnique({
    where: { id: input.salesOrderId },
    select: { documentNo: true, grandTotal: true, quotationId: true },
  })
  if (!so) throw new Error("Pesanan Penjualan tidak ditemukan")
  if (so.quotationId) {
    await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${so.quotationId} FOR UPDATE`
  }

  const priorInvoices = await tx.salesInvoice.findMany({
    where: {
      salesOrderId: input.salesOrderId,
      deletedAt: null,
      status: { not: "cancelled" },
      ...(input.excludeInvoiceId ? { id: { not: input.excludeInvoiceId } } : {}),
    },
    select: {
      grandTotal: true,
      items: { select: { itemId: true, qty: true, uom: true } },
    },
  })

  const alreadyBilled = priorInvoices.reduce(
    (sum, inv) => safeAdd(sum, Number(inv.grandTotal), 2),
    0,
  )
  const orderTotal = Number(so.grandTotal)
  if (Number.isFinite(orderTotal)) {
    const excess = cumulativeValueExcess(alreadyBilled, input.candidateGrandTotal, orderTotal)
    if (excess > 0.01) {
      throw new Error(
        `Faktur melebihi nilai Pesanan Penjualan ${so.documentNo}: sudah tertagih ${alreadyBilled}, ` +
          `faktur ini ${input.candidateGrandTotal}, nilai pesanan ${orderTotal} (kelebihan ${excess}). ` +
          `Kurangi nilai faktur atau ubah pesanan.`,
      )
    }
  }

  const soItems = await tx.salesOrderItem.findMany({
    where: { salesOrderId: input.salesOrderId },
    select: { itemId: true, qty: true },
  })
  const orderedByItem = new Map<number, number>()
  for (const line of soItems) {
    if (line.itemId == null) continue
    orderedByItem.set(line.itemId, (orderedByItem.get(line.itemId) ?? 0) + Number(line.qty))
  }
  if (orderedByItem.size === 0) return

  const toBase = async (itemId: number, qty: number, uom: string | null | undefined) =>
    qty * (await toBaseFactor(tx, itemId, uom))
  const invoicedByItem = new Map<number, number>()
  for (const inv of priorInvoices) {
    for (const line of inv.items) {
      if (line.itemId == null) continue
      invoicedByItem.set(
        line.itemId,
        (invoicedByItem.get(line.itemId) ?? 0) + (await toBase(line.itemId, Number(line.qty), line.uom)),
      )
    }
  }
  const candidateByItem = new Map<number, number>()
  for (const line of input.candidateLines) {
    if (line.itemId == null) continue
    candidateByItem.set(
      line.itemId,
      (candidateByItem.get(line.itemId) ?? 0) + (await toBase(line.itemId, Math.max(0, Number(line.qty) || 0), line.uom)),
    )
  }
  const violation = findCumulativeQtyExcess(candidateByItem, orderedByItem, invoicedByItem)
  if (violation) {
    throw new Error(
      `Faktur melebihi jumlah dipesan untuk item #${violation.key} pada Pesanan Penjualan ${so.documentNo}: ` +
        `dipesan ${violation.ordered}, sudah difakturkan ${violation.already}, faktur ini ${violation.requested} ` +
        `(sisa ${violation.remaining}). Kurangi jumlah faktur atau ubah pesanan.`,
    )
  }
}

/**
 * TASK-016 BUG-03: cap kumulatif pengiriman per baris SO.
 *
 * `requestedByLine` = qty surat jalan ini per salesOrderItemId, sudah
 * diagregasi pemanggil. Yang sudah berjalan dibaca dari DeliveryOrderItem
 * surat jalan lain atas baris yang sama: semua status selain batal saat
 * pembuatan (konsep ikut memesan porsi, pola faktur progres), atau hanya
 * shipped/delivered saat klaim kirim. Kuantitas dibandingkan dalam satuan
 * dasar (unit baris surat jalan dikonversi; baris SO selalu satuan dasar).
 * Wajib di dalam transaksi yang sudah mengunci baris SO.
 */
async function assertDeliveryWithinOrderCap(
  tx: Prisma.TransactionClient,
  input: {
    salesOrderId: number
    requestedByLine: ReadonlyMap<number, number>
    excludeDeliveryOrderId?: number
    shippedOnly?: boolean
  },
): Promise<void> {
  const lineIds = [...input.requestedByLine.keys()]
  if (lineIds.length === 0) return

  const soLines = await tx.salesOrderItem.findMany({
    where: { id: { in: lineIds }, salesOrderId: input.salesOrderId },
    select: { id: true, qty: true },
  })
  const orderedByLine = new Map(soLines.map((line) => [line.id, Number(line.qty)]))

  const priorItems = await tx.deliveryOrderItem.findMany({
    where: {
      salesOrderItemId: { in: lineIds },
      ...(input.excludeDeliveryOrderId
        ? { deliveryOrderId: { not: input.excludeDeliveryOrderId } }
        : {}),
      deliveryOrder: input.shippedOnly
        ? { status: { in: ["shipped", "delivered"] } }
        : { status: { not: "cancelled" } },
    },
    select: { salesOrderItemId: true, itemId: true, qty: true, unit: true },
  })
  const deliveredByLine = new Map<number, number>()
  for (const row of priorItems) {
    if (row.salesOrderItemId == null) continue
    const baseQty =
      row.itemId == null
        ? Number(row.qty)
        : Number(row.qty) * (await toBaseFactor(tx, row.itemId, row.unit))
    deliveredByLine.set(row.salesOrderItemId, (deliveredByLine.get(row.salesOrderItemId) ?? 0) + baseQty)
  }

  const violation = findCumulativeQtyExcess(input.requestedByLine, orderedByLine, deliveredByLine)
  if (violation) {
    throw new Error(
      `Pengiriman melebihi pesanan untuk baris pesanan #${violation.key}: dipesan ${violation.ordered}, ` +
        `sudah terkirim ${violation.already}, surat jalan ini ${violation.requested} (sisa ${violation.remaining}). ` +
        `Kurangi jumlah surat jalan atau ubah pesanan.`,
    )
  }
}

/**
 * F-2026-10-20-10: buat faktur selisih DRAFT dari revisi penawaran.
 *
 * Setelah revisi menaikkan Quotation.grandTotal (reviseQuotation), nilai
 * baru tidak otomatis tertagih: invoice lama tetap sebesar nilai lama.
 * Aksi ini membuat SalesInvoice DRAFT sebesar selisih positif
 * (grandTotal berjalan − Σ invoice non-cancelled lewat TIGA jembatan
 * quotationId/salesOrderId/projectId, dedup per id — pola
 * loadJobBillingSummary). Selalu DRAFT: posting (jurnal piutang +
 * keluar stok) tetap lewat postInvoice dari UI faktur, bukan di sini.
 * Selisih ≤ 0 ditolak (kelebihan tagih = retur/kredit, bukan faktur).
 * Baris item tunggal tanpa itemId (penyesuaian nilai, bukan barang):
 * posting-nya tidak menggerakkan stok karena itemId null.
 */

function draftDerivedInvoiceData(input: {
  customerId: number
  customerVehicleId: number | null
  quotationId: number
  date: Date
  amount: number
  description: string
  createdBy: number
}) {
  return {
    // K5: draft lahir tanpa nomor & tanpa slug berbasis nomor; keduanya
    // diterbitkan saat posting (postInvoice). Slug null sah (fallback id).
    documentNo: null,
    slug: null,
    customerId: input.customerId,
    customerVehicleId: input.customerVehicleId,
    quotationId: input.quotationId,
    date: input.date,
    subtotal: input.amount,
    discount: 0,
    tax: 0,
    grandTotal: input.amount,
    paidAmount: 0,
    totalAmount: input.amount,
    taxAmount: 0,
    status: "draft" as const,
    notes: input.description,
    createdBy: input.createdBy,
    items: {
      create: [
        {
          itemId: null,
          description: input.description,
          qty: 1,
          unitPrice: input.amount,
          discount: 0,
          total: input.amount,
        },
      ],
    },
  }
}

export async function createDifferenceInvoice(quotationId: number) {
  try {
    const user = await requirePermission("create_sales_invoices")

    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, deletedAt: null },
      select: {
        id: true,
        documentNo: true,
        customerId: true,
        customerVehicleId: true,
        grandTotal: true,
        revisionNumber: true,
      },
    })
    if (!quotation) return { success: false, error: "Penawaran tidak ditemukan" }
    if (quotation.revisionNumber <= 0) {
      return { success: false, error: "Penawaran belum pernah direvisi; tidak ada selisih revisi" }
    }

    const today = new Date()
    await assertPeriodOpen(today)

    const differenceDescription = `Faktur selisih revisi v${quotation.revisionNumber} penawaran ${quotation.documentNo}`

    const invoice = await prisma.$transaction(async (tx) => {
      // Kunci baris quotation: dua klik bersamaan tidak boleh sama-sama
      // membaca total tertagih lama lalu membuat dua draft selisih.
      await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

      await assertInvoiceAllowedForWorkOrderBridges(tx, { quotationId })

      const invoices = await collectQuotationInvoices(tx, quotationId)

      const candidate = computeDifferenceInvoiceCandidate({
        quotationGrandTotal: Number(quotation.grandTotal),
        invoices,
      })
      if (!candidate.eligible) throw new Error(candidate.reason ?? "Tidak ada selisih revisi")

      // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 5: faktur turunan
      // menaikkan tertagih ikut dinilai; tertahan = rollback.
      const diffAttempt = {
        customerId: quotation.customerId,
        documentType: "sales_invoice" as const,
        attemptedAmount: candidate.differenceAmount,
        requestedBy: Number(user.id),
        quotationId: quotation.id,
        // Tanpa FormData: tanpa alasan -> tanpa rekod (lihat fase 3).
        requestReason: null,
      }
      const diffOverrideId = assertCreditGatePassed(
        await assessCreditGateInTx(tx, diffAttempt),
      )
      const created = await tx.salesInvoice.create({
        data: draftDerivedInvoiceData({
          customerId: quotation.customerId,
          customerVehicleId: quotation.customerVehicleId,
          quotationId: quotation.id,
          date: today,
          amount: candidate.differenceAmount,
          description: differenceDescription,
          createdBy: Number(user.id),
        }),
      })
      if (diffOverrideId != null) {
        await consumeApprovedCreditOverrideInTx(tx, diffOverrideId, diffAttempt, {
          id: created.id,
          documentNo: created.documentNo,
        })
      }
      return created
    })

    await logActivity("create", "SalesInvoice", invoice.id, `Membuat faktur selisih revisi #${invoice.id} dari penawaran ${quotation.documentNo}`)
    await requestApprovalIfConfigured("SalesInvoice", invoice.id, Number(user.id))
    revalidatePath("/penjualan/faktur")
    revalidatePath("/penjualan/penawaran")
    return { success: true, id: invoice.id, slug: invoice.slug ?? null }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[createDifferenceInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


/**
 * F-2026-10-20-58: buat faktur progres DRAFT sebesar target kumulatif.
 *
 * Target = persen × Quotation.grandTotal berjalan; nominal = target −
 * Σ invoice non-cancelled lewat tiga jembatan (definisi sama faktur
 * selisih, draft ikut memesan porsi — builder computeProgressInvoiceCandidate).
 * Selalu DRAFT tanpa jurnal: posting tetap lewat postInvoice. Baris item
 * tunggal tanpa itemId (penyesuaian nilai, bukan barang) sehingga posting
 * tidak menggerakkan stok. Persen divalidasi server (builder menolak
 * 0/>100/nilai kontrak tak positif), jangan percaya kiriman klien.
 */
export async function createProgressInvoice(quotationId: number, targetPercent: number) {
  try {
    const user = await requirePermission("create_sales_invoices")

    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, deletedAt: null },
      select: {
        id: true,
        documentNo: true,
        customerId: true,
        customerVehicleId: true,
        grandTotal: true,
      },
    })
    if (!quotation) return { success: false, error: "Penawaran tidak ditemukan" }

    const today = new Date()
    await assertPeriodOpen(today)

    const progressDescription = `Faktur progres ${targetPercent}% penawaran ${quotation.documentNo}`

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

      await assertInvoiceAllowedForWorkOrderBridges(tx, { quotationId })

      const invoices = await collectQuotationInvoices(tx, quotationId)
      const candidate = computeProgressInvoiceCandidate({
        quotationGrandTotal: Number(quotation.grandTotal),
        targetPercent,
        invoices,
      })
      if (!candidate.eligible) throw new Error(candidate.reason ?? "Tidak ada progres yang bisa ditagih")

      // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 5.
      const progAttempt = {
        customerId: quotation.customerId,
        documentType: "sales_invoice" as const,
        attemptedAmount: candidate.progressAmount,
        requestedBy: Number(user.id),
        quotationId: quotation.id,
        // Tanpa FormData: tanpa alasan -> tanpa rekod (lihat fase 3).
        requestReason: null,
      }
      const progOverrideId = assertCreditGatePassed(
        await assessCreditGateInTx(tx, progAttempt),
      )
      const created = await tx.salesInvoice.create({
        data: draftDerivedInvoiceData({
          customerId: quotation.customerId,
          customerVehicleId: quotation.customerVehicleId,
          quotationId: quotation.id,
          date: today,
          amount: candidate.progressAmount,
          description: progressDescription,
          createdBy: Number(user.id),
        }),
      })
      if (progOverrideId != null) {
        await consumeApprovedCreditOverrideInTx(tx, progOverrideId, progAttempt, {
          id: created.id,
          documentNo: created.documentNo,
        })
      }
      return created
    })

    await logActivity("create", "SalesInvoice", invoice.id, `Membuat faktur progres ${targetPercent}% #${invoice.id} dari penawaran ${quotation.documentNo}`)
    await requestApprovalIfConfigured("SalesInvoice", invoice.id, Number(user.id))
    revalidatePath("/penjualan/faktur")
    revalidatePath("/penjualan/penawaran")
    return { success: true, id: invoice.id, slug: invoice.slug ?? null }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[createProgressInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * F-2026-10-20-59 (vonis Salsa 18:30): kredit revisi-turun lahir sebagai
 * CustomerCredit pasif sourceType RevisionDown, sourceId=quotationId,
 * TANPA jurnal saat create. Jurnal hanya lahir saat alokasi/refund lewat
 * customer-credit.service existing. Nominal dari builder #229
 * (computeRevisionDownCreditCandidate) — jangan hitung ulang di sini.
 * Lock baris quotation di dalam tx: submit ganda bersamaan tidak boleh
 * sama-sama membaca kredit existing lama.
 */
export async function createRevisionDownCredit(quotationId: number) {
  try {
    const user = await requirePermission("confirm_down_payments")

    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, deletedAt: null },
      select: { id: true, documentNo: true, customerId: true, grandTotal: true, revisionNumber: true },
    })
    if (!quotation) return { success: false, error: "Penawaran tidak ditemukan" }
    if (quotation.revisionNumber <= 0) {
      return { success: false, error: "Penawaran belum pernah direvisi; tidak ada revisi-turun" }
    }

    const credit = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

      const [invoices, confirmedDownPayments, downPayments] = await Promise.all([
        collectQuotationInvoices(tx, quotationId),
        tx.downPayment.findMany({
          where: { quotationId, status: "confirmed" },
          select: { amount: true },
        }),
        tx.downPayment.findMany({ where: { quotationId }, select: { id: true } }),
      ])
      const [existingRevisionDown, existingDownPayment] = await Promise.all([
        tx.customerCredit.findMany({
          where: { sourceType: "RevisionDown", sourceId: quotationId },
          select: { receivedAmount: true, allocatedAmount: true, refundedAmount: true },
        }),
        downPayments.length === 0
          ? Promise.resolve([])
          : tx.customerCredit.findMany({
              where: { sourceType: "DownPayment", sourceId: { in: downPayments.map((d) => d.id) } },
              select: { receivedAmount: true },
            }),
      ])
      const candidate = computeRevisionDownCreditCandidate({
        quotationGrandTotal: Number(quotation.grandTotal),
        invoices,
        confirmedDownPayments: confirmedDownPayments.map((d) => ({ amount: Number(d.amount) })),
        existingRevisionDownCredits: existingRevisionDown.map((c) => ({
          receivedAmount: Number(c.receivedAmount),
          allocatedAmount: Number(c.allocatedAmount),
          refundedAmount: Number(c.refundedAmount),
        })),
        existingDownPaymentCredits: existingDownPayment.map((c) => ({
          receivedAmount: Number(c.receivedAmount),
        })),
      })
      if (!candidate.eligible) throw new Error(candidate.reason ?? "Tidak ada kredit revisi-turun")

      const documentNo = await generateDocumentNumber("CC")
      return tx.customerCredit.create({
        data: {
          documentNo,
          customerId: quotation.customerId,
          sourceType: "RevisionDown",
          sourceId: quotation.id,
          receivedAmount: candidate.creditAmount,
          notes: `Kredit revisi-turun v${quotation.revisionNumber} penawaran ${quotation.documentNo}: tertagih/DP terikat ${candidate.committedAmount} melebihi nilai berjalan ${candidate.contractValue}. Tanpa jurnal saat lahir; jurnal hanya saat alokasi/refund.`,
          createdBy: Number(user.id),
        },
      })
    })

    await logActivity("create", "CustomerCredit", credit.id, `Membuat kredit revisi-turun #${credit.id} dari penawaran ${quotation.documentNo}`)
    revalidatePath("/penjualan/penawaran")
    revalidatePath("/penjualan/faktur")
    return { success: true, id: credit.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createRevisionDownCredit]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function createSalesInvoice(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_invoices")

  const idempotencyKey = formData.get("idempotencyKey") as string | null

  const parsed = parseFormData(createSalesInvoiceSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  // Lapis-2: tanggal faktur harus di periode terbuka, sebelum mutasi apa pun.
  // (Lapis-1 tinggal di hook posting; faktur draft belum memposting jadi hook
  // tidak menyala — penjagaan di sini menutup celah back-date draft.)
  await assertPeriodOpen(wibDateToUtcMidnight(v.date))

  // K5: draft lahir tanpa documentNo/slug; nomor diterbitkan saat posting.
  const slug = null

  // Item boleh datang langsung dari form (hasil konversi Pesanan Penjualan).
  // Faktur yang lahir hanya dengan header memaksa kasir mengetik ulang seluruh
  // baris. Nilai di-clamp seperti updateSalesInvoice: baris negatif tak tersimpan.
  const itemsJson = v.items
  const rawItems = itemsJson
    ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number; description?: string | null }>>(itemsJson) ?? [])
    : null

  const invoice = await prisma.$transaction(async (tx) => {
    await checkIdempotency(idempotencyKey, tx, user.id)

    // Gerbang invoiceForbidden garansi (F-021 tahap 3 G5, server): faktur
    // dari jembatan quotation/sales-order milik WO repair klaim covered
    // ditolak sebelum lahir.
    await assertInvoiceAllowedForWorkOrderBridges(tx, {
      quotationId: v.quotationId ?? null,
      salesOrderId: v.salesOrderId ?? null,
    })

    // Gerbang status pesanan: tombol di detail pesanan dan daftar pemilih di
    // faktur/tambah membaca DELIVERABLE_ORDER_STATUSES; server menegakkan
    // daftar yang sama supaya URL/form yang ditempel tidak bisa memfakturkan
    // pesanan konsep/ditolak. Faktur langsung dari penawaran (quotationId
    // tanpa salesOrderId) tetap boleh.
    let inheritedSalesEmployeeId: number | null = null
    if (v.salesOrderId) {
      const so = await tx.salesOrder.findUnique({
        where: { id: v.salesOrderId },
        select: { status: true, salesEmployeeId: true, quotationId: true },
      })
      if (!so) throw new Error("Pesanan Penjualan tidak ditemukan")
      if (!(DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(so.status)) {
        throw new Error(
          `Pesanan Penjualan berstatus '${so.status}' belum bisa difaktur (harus ${DELIVERABLE_ORDER_STATUS_LABELS})`,
        )
      }
      inheritedSalesEmployeeId = so.salesEmployeeId
      if (inheritedSalesEmployeeId === null && so.quotationId) {
        const q = await tx.quotation.findUnique({
          where: { id: so.quotationId },
          select: { salesEmployeeId: true },
        })
        inheritedSalesEmployeeId = q?.salesEmployeeId ?? null
      }
    } else if (v.quotationId) {
      const q = await tx.quotation.findUnique({
        where: { id: v.quotationId },
        select: { salesEmployeeId: true },
      })
      inheritedSalesEmployeeId = q?.salesEmployeeId ?? null
    }

    // F-PRICELIST-01: baris langsung dari form mendapat harga price-list
    // (unitPrice form diperlakukan sebagai Item.price fallback). Baris
    // hasil konversi (salesOrderId terisi) mempertahankan harga SO.
    const items =
      rawItems && !v.salesOrderId
        ? await applyPriceListLines(tx, v.customerId, wibDateToUtcMidnight(v.date), rawItems)
        : rawItems

    let subtotal = 0
    let discountTotal = 0
    let taxAmount = 0
    let grandTotal = 0

    if (items !== null && items.length > 0) {
      subtotal = items.reduce((sum, item) => {
        const safeQty = Math.max(0, Number(item.qty) || 0)
        const safePrice = Math.max(0, Number(item.unitPrice) || 0)
        const safeDiscount = Math.max(0, Number(item.discount) || 0)
        return safeAdd(sum, Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)), 0)
      }, 0)
      discountTotal = Math.min(Math.max(0, Number(v.discount ?? 0)), subtotal)
      const taxRate = Math.max(0, Number(v.taxRate ?? 0) || 0)
      taxAmount = safeRound(safeDivide(safeMultiply(safeSubtract(subtotal, discountTotal, 0), taxRate, 4), 100, 4), 0)
      grandTotal = safeSubtract(safeAdd(subtotal, taxAmount, 0), discountTotal, 0)
    }

    // TASK-016 BUG-06: faktur atas SO dibatasi kumulatif (nilai + qty
    // satuan dasar) terhadap SO di dalam tx yang sama, baris SO terkunci.
    if (v.salesOrderId) {
      await assertInvoiceWithinSalesOrderCap(tx, {
        salesOrderId: v.salesOrderId,
        candidateGrandTotal: grandTotal,
        candidateLines: (items ?? []).map((item) => ({
          itemId: item.itemId,
          qty: Number(item.qty),
          uom: (item as { uom?: string | null }).uom ?? null,
        })),
      })
    }
    // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 3 (sesudah
    // assertPeriodOpen di atas): nilai SEBELUM baris lahir dalam tx ini.
    const invAttempt = {
      customerId: v.customerId,
      documentType: "sales_invoice" as const,
      attemptedAmount: grandTotal,
      requestedBy: Number(user.id),
      quotationId: v.quotationId ?? null,
      salesOrderId: v.salesOrderId ?? null,
      requestReason: v.creditOverrideReason ?? null,
    }
    const invOverrideId = assertCreditGatePassed(
      await assessCreditGateInTx(tx, invAttempt),
    )

    const createdInvoice = await tx.salesInvoice.create({
      data: {
        documentNo: null,
        slug,
        customerId: v.customerId,
        salesOrderId: v.salesOrderId ?? null,
        quotationId: v.quotationId ?? null,
        salesEmployeeId: inheritedSalesEmployeeId,
        date: wibDateToUtcMidnight(v.date),
        dueDate: v.dueDate ? wibDateToUtcMidnight(v.dueDate) : null,
        taxInvoiceNumber: v.taxInvoiceNumber ?? null,
        subtotal,
        discount: discountTotal,
        tax: taxAmount,
        grandTotal,
        paidAmount: 0,
        totalAmount: grandTotal,
        taxAmount,
        status: "draft",
        createdBy: Number(user.id),
        ...(items && items.length > 0
          ? {
              items: {
                create: items.map((item) => {
                  const safeQty = Math.max(0, Number(item.qty) || 0)
                  const safePrice = Math.max(0, Number(item.unitPrice) || 0)
                  const safeDiscount = Math.max(0, Number(item.discount) || 0)
                  return {
                    itemId: item.itemId,
                    description: item.description ?? null,
                    qty: safeQty,
                    unitPrice: safePrice,
                    discount: safeDiscount,
                    total: Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)),
                    // F-018 BR-TIER-09: hanya baris langsung hasil resolver
                    // yang membawa sumber; konversi SO tetap null (bukan klaim).
                    priceSource: "priceSource" in item ? (item.priceSource ?? null) : null,
                    priceListId: "priceListId" in item ? (item.priceListId ?? null) : null,
                    priceListMinQty:
                      "priceListMinQty" in item && item.priceListMinQty != null
                        ? new Prisma.Decimal(Number(item.priceListMinQty).toFixed(2))
                        : null,
                  }
                }),
              },
            }
          : {}),
      },
    })
    if (invOverrideId != null) {
      await consumeApprovedCreditOverrideInTx(tx, invOverrideId, invAttempt, {
        id: createdInvoice.id,
        documentNo: createdInvoice.documentNo,
      })
    }
    return createdInvoice
  })

  await logActivity("create", "SalesInvoice", invoice.id, `Membuat faktur penjualan #${invoice.id}`)
  await requestApprovalIfConfigured("SalesInvoice", invoice.id, Number(user.id));
  revalidatePath("/penjualan/faktur")
  return { success: true, id: invoice.id, slug }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[createSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== PAYMENT ACTIONS ====================

export async function createSalesPayment(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_payments")

  const parsed = parseFormData(createSalesPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const idempotencyKey = formData.get("idempotencyKey") as string | null
  const salesInvoiceId = v.salesInvoiceId
  const amount = v.amount
  // PPh yang dipotong pelanggan (opsional): kas yang diterima tetap `amount`,
  // sedangkan `withholdingAmount` menambah pelunasan piutang lewat jurnal
  // Dr PPh dibayar dimuka. Tanpa jenis PPh, potongannya tidak punya akun tujuan.
  const withholdingAmount = v.withholdingAmount ?? 0
  if (withholdingAmount > 0 && !v.withholdingTypeId) {
    return { success: false, error: "Jenis PPh wajib dipilih bila ada potongan PPh" }
  }
  const documentNo = await generateDocumentNumber("PAY")
  const slug = await nextSlug("salesPayment", documentNo)

  // Atomic: lock invoice, validate remaining, create payment + recalc + attach
  // in one transaction. The attachment linkage was previously OUTSIDE the tx —
  // a failure there would leave a confirmed payment with no supporting docs
  // (operator-visible mismatch, but not a balance-sheet bug since the journal is
  // already posted). Move it inside so the payment row only exists when its
  // attachments are linked (all-or-nothing from the caller's perspective).
  const payment = await prisma.$transaction(async (tx) => {
    await checkIdempotency(idempotencyKey, tx, user.id)

    // Lock invoice row to prevent concurrent overpay
    await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`

    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } })
    if (!["posted", "partial"].includes(invoice.status)) {
      throw new Error("Pembayaran hanya bisa dibuat untuk invoice posted/partial")
    }
    const remaining = safeSubtract(invoice.grandTotal, invoice.paidAmount, 0)
    // Faktur lunas bila kas diterima + PPh dipotong pelanggan menutup sisanya.
    const settled = safeAdd(amount, withholdingAmount)
    // FIN-BR-006: kelebihan dalam toleransi lunas Rp1 adalah pembulatan
    // rupiah-penuh, bukan overpay — jangan tolak. Di atas itu tetap tolak.
    if (settled > remaining + SETTLEMENT_TOLERANCE_IDR) {
      throw new Error(
        withholdingAmount > 0
          ? `Jumlah pembayaran + potongan PPh (${settled}) melebihi sisa tagihan (${remaining})`
          : `Jumlah pembayaran melebihi sisa tagihan (${remaining})`,
      )
    }

    if (v.accountId != null) {
      const ok = await tx.account.count({ where: { id: v.accountId } })
      if (!ok) throw new Error(`Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.`)
    }

    const created = await tx.salesPayment.create({
      data: {
        documentNo,
        slug,
        salesInvoiceId,
        customerId: invoice.customerId,
        amount,
        paymentDate: wibDateToUtcMidnight(v.paymentDate),
        paymentMethod: v.paymentMethod,
        accountId: v.accountId ?? null,
        withholdingTypeId: v.withholdingTypeId ?? null,
        withholdingAmount,
        withholdingCertificateNo: v.withholdingCertificateNo ?? null,
        withholdingDate: v.withholdingDate ? wibDateToUtcMidnight(v.withholdingDate) : null,
        referenceNo: v.referenceNo ?? null,
        notes: v.notes ?? null,
        createdBy: Number(user.id),
      },
    })
    // Recalculate invoice paid amount/status atomically with the payment insert
    await onSalesPaymentRecalculate(created.id, tx)
    // Create accounting journal (idempotent; guarded by unique referenceType+referenceId)
    await onSalesPaymentCreated(created.id, Number(user.id), tx)

    // Associate uploaded attachments with the new payment — moved INSIDE the tx
    // so a failed updateMany rolls back the payment create + journal + recalc
    // (none of which are useful without the supporting docs attached).
    const attachmentIds = v.attachmentIds as string | undefined
    if (attachmentIds) {
      await attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "sales_payment", referenceId: created.id, uploadedBy: Number(user.id),
      })
    }

    return created
  })

  await logActivity("create", "SalesPayment", payment.id, `Membuat pembayaran penjualan #${payment.id}`)
  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== SALES RETURN ACTIONS ====================

export async function completeSalesReturn(returnId: number) {
  try {
  // F-2026-10-25-012-S (BR-SR-01/03/04): menyelesaikan retur = stok masuk +
  // jurnal, jadi wajib izin khusus approve_sales_returns (edit_sales_returns
  // saja tidak cukup), hanya dari status draft, dan penyelesai != pembuat
  // (SoD). createdBy null (baris legacy) boleh diselesaikan penyetuju
  // berizin (EC-2). Semua gerbang dievaluasi SEBELUM transaksi dibuka;
  // hook stok/jurnal/snapshot pajak tidak diubah.
  const user = await requirePermission("approve_sales_returns")

  const salesReturn = await prisma.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  })

  if (salesReturn.status !== "draft") {
    throw new Error("Retur penjualan hanya bisa diselesaikan dari status draft")
  }

  // P4 vonis F-2026-10-26-121-V (syarat pengimbang, tanpa model baru):
  // retur complete tanpa reason trim non-kosong = koreksi tak teraudit.
  // Tolak SEBELUM mutasi apa pun (stok/jurnal nol).
  if (String(salesReturn.reason ?? "").trim().length === 0) {
    throw new Error("Retur penjualan tidak bisa diselesaikan tanpa alasan tertulis (reason wajib diisi).")
  }

  if (salesReturn.createdBy != null && Number(salesReturn.createdBy) === Number(user.id)) {
    throw new Error("Retur penjualan tidak boleh diselesaikan oleh pembuatnya sendiri (pemisahan tugas) — minta penyetuju lain yang berizin approve_sales_returns.")
  }

  // P1-1: identitas fisik wajib untuk item tracked. Tanpa serial/batch
  // eksplisit, hook merevive serial "terbaru" dan layer tanpa batch — bukan
  // identitas yang benar-benar kembali. Tolak di sini (sebelum mutasi) agar
  // pesan jelas; hook memvalidasi ulang dalam tx.
  const trackedIds = [...new Set(salesReturn.items.map((it) => it.itemId))]
  if (trackedIds.length > 0) {
    const trackedRows = await prisma.item.findMany({
      where: { id: { in: trackedIds } },
      select: { id: true, trackSerial: true, trackBatch: true },
    })
    const trackByItem = new Map(trackedRows.map((r) => [r.id, r]))
    for (const it of salesReturn.items) {
      const t = trackByItem.get(it.itemId)
      if (!t) continue
      const serials = Array.isArray(it.serialNumbers) ? (it.serialNumbers as unknown[]).filter((v) => String(v ?? "").trim()).length : 0
      const batches = Array.isArray(it.batchNumbers) ? (it.batchNumbers as unknown[]).filter((v) => String(v ?? "").trim()).length : 0
      if (t.trackSerial && serials === 0) {
        throw new Error(`Item #${it.itemId} memakai pelacakan serial — sebutkan nomor seri yang benar-benar kembali.`)
      }
      if (t.trackBatch && batches === 0) {
        throw new Error(`Item #${it.itemId} memakai pelacakan batch — sebutkan nomor batch yang benar-benar kembali.`)
      }
    }
  }

  // Atomically process stock adjustment and post GL journal in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Stock Move IN — the stock hook sets status to "completed" at the end. Do NOT
    // set it here first, otherwise the hook's "already completed" guard aborts and
    // stock is never returned while the accounting leg still posts (GL/stock drift).
    await onSalesReturnStock(returnId, Number(user.id), tx)

    // Accounting journal
    await onSalesReturnCompleted(returnId, Number(user.id), tx)
  })

  await logActivity("complete", "SalesReturn", returnId, `Menyelesaikan retur penjualan #${returnId}`)
  revalidatePath("/penjualan/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[completeSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * P1-1: parse identitas fisik retur dari payload baris. Form mengirim
 * `serialNumbers`/`batchNumbers` sebagai array string atau string koma-pisah.
 * Kembalikan array bersih (unik, trim, tanpa kosong) atau undefined bila tak ada.
 */
function parseReturnIdentity(value: unknown): string[] | undefined {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const clean = [...new Set(raw.map((v) => String(v ?? "").trim()).filter((v) => v.length > 0))];
  return clean.length ? clean : undefined;
}

type SalesReturnItemInput = {
  itemId: number;
  qty: number;
  serialNumbers?: string[];
  batchNumbers?: string[];
};

/**
 * Baris retur penjualan dari JSON FormData `items` ([{ itemId, qty, ... }]).
 * qty bisa string berformat Indonesia dari klien non-form ("2.000" = 2000,
 * "1,5" = 1.5) — wajib lewat parser repo; Number() mentah membaca "2.000"
 * jadi 2 dan "abc" jadi NaN yang lolos filter >0 lalu diclamp 0.01 diam-diam,
 * dan penjaga over-return ikut menilai angka rusak. Baris berkode item dengan
 * qty tak terbaca ditolak berpesan, bukan dibuang/dinclamp diam-diam. Baris
 * tanpa item (itemId kosong/0) tetap dibuang (baris kosong form); qty <= 0
 * pada baris berkode tetap dibuang (perilaku lama: baris belum diisi).
 * Harga/cost TIDAK dari payload: server resolve dari faktur/master.
 */
function parseSalesReturnItems(itemsJson: string | null | undefined): SalesReturnItemInput[] {
  const rows = safeJsonParse<{ itemId?: unknown; qty?: unknown; serialNumbers?: unknown; batchNumbers?: unknown }[]>(itemsJson ?? null) ?? [];
  const items: SalesReturnItemInput[] = [];
  for (const row of rows) {
    const itemId = parseLocaleNumber(row?.itemId as string | number | null | undefined);
    if (itemId === null || itemId <= 0) continue;
    const qty = parseLocaleNumber(row.qty as string | number | null | undefined);
    if (qty === null) {
      throw new Error(`Kuantitas retur item #${itemId} tidak valid — isi angka lebih dari 0 (mis. 2 atau 2.000).`);
    }
    if (qty <= 0) continue;
    items.push({
      itemId,
      qty,
      serialNumbers: parseReturnIdentity(row.serialNumbers),
      batchNumbers: parseReturnIdentity(row.batchNumbers),
    });
  }
  return items;
}

export async function createSalesReturn(formData: FormData) {
  try {
  const user = await requirePermission("create_sales_returns")

  const parsed = parseFormData(createSalesReturnSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const documentNo = await generateDocumentNumber("SR")
  const slug = await nextSlug("salesReturn", documentNo)

  const itemsJson = v.items
  const validItems = parseSalesReturnItems(itemsJson)
  const returnItemIds = validItems.map((it) => it.itemId)
  const returnCostRows = returnItemIds.length
    ? await prisma.item.findMany({ where: { id: { in: returnItemIds } }, select: { id: true, cost: true, price: true } })
    : []
  const baseReturnCostMap = new Map(returnCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))
  const baseMasterPriceMap = new Map(returnCostRows.map((r) => [r.id, Number(r.price ?? 0)]))

  // Selling price for the AR reduction: prefer the original invoice line price,
  // fall back to the item master price, then cost.
  const invoiceId = v.salesInvoiceId ?? null
  // Gerbang status faktur: UI bisa dilewati lewat form yang ditempel, jadi
  // server menegakkan daftar yang sama dengan tombol/daftar di UI
  // (RETURNABLE_INVOICE_STATUSES). Retur tanpa faktur tetap boleh.
  if (invoiceId) {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: invoiceId },
      select: { status: true },
    })
    if (!invoice) return { success: false, error: "Faktur tidak ditemukan" }
    if (!(RETURNABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      return { success: false, error: `Faktur berstatus '${invoice.status}' tidak bisa diretur` }
    }
  }
  const invoicePriceMap = new Map<number, number>()
  const invoicedQtyByItem = new Map<number, number>()
  const invoiceUomByItem = new Map<number, string | null>()
  if (invoiceId) {
    const invItems = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: invoiceId, itemId: { in: returnItemIds.length ? returnItemIds : [-1] } },
      select: { itemId: true, unitPrice: true, qty: true, uom: true },
    })
    for (const it of invItems) {
      if (it.itemId == null) continue
      invoicePriceMap.set(it.itemId, Number(it.unitPrice))
      invoiceUomByItem.set(it.itemId, it.uom)
      invoicedQtyByItem.set(it.itemId, (invoicedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
    }
  }
  const factorRows = await Promise.all(returnItemIds.map(async (itemId) => [itemId, await toBaseFactor(prisma, itemId, invoiceUomByItem.get(itemId))] as const))
  const factorByItem = new Map(factorRows)
  const returnCostMap = new Map([...baseReturnCostMap].map(([itemId, cost]) => [itemId, cost * (factorByItem.get(itemId) ?? 1)]))
  const masterPriceMap = new Map([...baseMasterPriceMap].map(([itemId, price]) => [itemId, price * (factorByItem.get(itemId) ?? 1)]))
  // Unit prices and costs are stored per invoice UoM; stock quantities/costs use base UoM.
  const resolvePrice = (itemId: number) =>
    invoicePriceMap.get(itemId) ?? (masterPriceMap.get(itemId) || returnCostMap.get(itemId) || 0)

  // Lock the invoice + re-run the over-return guard INSIDE the transaction so
  // two concurrent returns against the same invoice can't each pass the cap
  // (TOCTOU) and together over-restock inventory + over-credit AR. Mirrors the
  // createDownPayment lock pattern. A violation throws (rolls back the no-op tx)
  // and is surfaced by the outer catch with the same message.
  const salesReturn = await prisma.$transaction(async (tx) => {
    if (invoiceId) {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE`

      const priorReturns = await tx.salesReturnItem.findMany({
        where: {
          salesReturn: { salesInvoiceId: invoiceId, status: { not: "cancelled" } },
          itemId: { in: returnItemIds.length ? returnItemIds : [-1] },
        },
        select: { itemId: true, qty: true },
      })
      const alreadyReturnedByItem = new Map<number, number>()
      for (const r of priorReturns) {
        alreadyReturnedByItem.set(r.itemId, (alreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
      }

      const violation = findOverReturn(
        validItems.map((it) => ({ itemId: it.itemId, qty: it.qty })),
        invoicedQtyByItem,
        alreadyReturnedByItem
      )
      if (violation) {
        if (violation.type === "not_on_invoice") {
          throw new Error(`Item #${violation.itemId} tidak ada pada faktur yang dipilih, tidak bisa diretur.`)
        }
        throw new Error(
          `Jumlah retur item #${violation.itemId} melebihi yang difakturkan ` +
          `(difakturkan: ${violation.invoiced}, sudah diretur: ${violation.alreadyReturned}, sisa: ${violation.remaining}).`
        )
      }
    }

    return tx.salesReturn.create({
      data: {
        documentNo,
        slug,
        salesInvoiceId: invoiceId,
        customerId: v.customerId,
        date: wibDateToUtcMidnight(v.date),
        reason: v.reason ?? null,
        taxReturnNoteNumber: v.taxReturnNoteNumber ?? null,
        taxReturnNoteDate: v.taxReturnNoteDate ? wibDateToUtcMidnight(v.taxReturnNoteDate) : null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: validItems.map((item) => ({
            itemId: item.itemId,
            // qty sudah angka ter-parse (helper parseSalesReturnItems):
            // "2.000" tiba sebagai 2000, bukan menyusut jadi 2 / NaN->0.01.
            qty: item.qty,
            cost: returnCostMap.get(item.itemId) ?? 0,
            price: resolvePrice(item.itemId),
            // P1-1: identitas fisik yang benar-benar kembali.
            serialNumbers: item.serialNumbers,
            batchNumbers: item.batchNumbers,
          })),
        },
      },
    })
  })

  // Notify admins
  await notificationService.notifyAdmins('Retur Penjualan baru', `/penjualan/retur/${slug ?? salesReturn.id}`)

  await logActivity("create", "SalesReturn", salesReturn.id, `Membuat retur penjualan #${salesReturn.id}`)
  revalidatePath("/penjualan/retur")
  return { success: true, id: salesReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELIVERY ORDER ACTIONS ====================

/**
 * Baca `items` (JSON string dari editor item form surat jalan) menjadi baris yang
 * layak ditulis: `{ salesOrderItemId, qty }` dengan id bulat positif dan qty > 0.
 * Baris yang tidak lolos saring dibuang di sini; pemanggil menolak bila hasilnya
 * kosong, jadi payload yang seluruhnya rusak tidak pernah lahir sebagai surat
 * jalan tanpa baris.
 */
function parseDeliveryOrderLines(raw: string): Array<{ salesOrderItemId: number; qty: number }> {
  const parsed = safeJsonParse<unknown>(raw)
  if (!Array.isArray(parsed)) return []
  return parsed
    .map((line) => ({
      salesOrderItemId: Number((line as { salesOrderItemId?: unknown })?.salesOrderItemId),
      qty: Number((line as { qty?: unknown })?.qty),
    }))
    .filter(
      (line) =>
        Number.isInteger(line.salesOrderItemId) &&
        line.salesOrderItemId > 0 &&
        Number.isFinite(line.qty) &&
        line.qty > 0,
    )
}

export async function createDeliveryOrder(formData: FormData) {
  try {
  const user = await requirePermission("create_delivery_orders")

  const parsed = parseFormData(createDeliveryOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const salesOrderId = v.salesOrderId

  // Gerbang status di SERVER, bukan hanya di pemilih pesanan pada halaman: form
  // bisa dikirim dari URL/payload mana pun. Tanpa penjagaan ini, surat jalan bisa
  // dipasang ke pesanan konsep/dibatalkan — melahirkan dokumen logistik atas
  // komitmen pelanggan yang belum ada.
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: { id: true, documentNo: true, status: true, customerId: true },
  })
  if (!salesOrder) {
    return { success: false, error: "Pesanan penjualan tidak ditemukan." }
  }
  if (!(DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(salesOrder.status)) {
    return {
      success: false,
      error:
        `Surat jalan hanya bisa dibuat dari Pesanan Penjualan berstatus ${DELIVERABLE_ORDER_STATUS_LABELS}. ` +
        `Pesanan ${salesOrder.documentNo} masih berstatus "${salesOrder.status}".`,
    }
  }

  // Baris barang wajib. Tanpa `salesOrderItemId` yang terisi, laporan Pemenuhan
  // Pesanan tak punya cara mengaitkan barang yang keluar ke baris pesanan
  // (terkirim = 0 selamanya). Baris yang dikirim juga harus baris MILIK pesanan
  // ini: nomor baris pesanan lain akan menaikkan pemenuhan pesanan orang lain.
  const requestedLines = parseDeliveryOrderLines(v.items)
  if (requestedLines.length === 0) {
    return {
      success: false,
      error: "Surat jalan harus punya minimal satu baris barang dengan jumlah lebih dari 0.",
    }
  }

  const lines = await prisma.salesOrderItem.findMany({
    where: { id: { in: requestedLines.map((line) => line.salesOrderItemId) }, salesOrderId },
    select: { id: true, itemId: true },
  })
  const lineById = new Map(lines.map((line) => [line.id, line]))

  const bukanMilikPesanan = requestedLines.filter((line) => !lineById.has(line.salesOrderItemId))
  if (bukanMilikPesanan.length > 0) {
    return {
      success: false,
      error: `Baris pesanan #${bukanMilikPesanan.map((line) => line.salesOrderItemId).join(", #")} bukan milik pesanan ini.`,
    }
  }
  const tanpaBarangKatalog = [...lineById.values()].filter((line) => line.itemId === null)
  if (tanpaBarangKatalog.length > 0) {
    return {
      success: false,
      error: `Baris pesanan #${tanpaBarangKatalog.map((line) => line.id).join(", #")} tidak menunjuk barang katalog, jadi tidak bisa dikirim.`,
    }
  }

  // Dua baris untuk baris pesanan yang sama digabung supaya tidak ada dua baris
  // surat jalan yang menunjuk baris pesanan identik.
  const qtyByLine = new Map<number, number>()
  for (const line of requestedLines) {
    qtyByLine.set(line.salesOrderItemId, (qtyByLine.get(line.salesOrderItemId) ?? 0) + line.qty)
  }

  const documentNo = await generateDocumentNumber("DO")
  const slug = await nextSlug("deliveryOrder", documentNo)

  // TASK-016 BUG-03: cap kumulatif per baris SO di dalam transaksi dengan
  // baris SO terkunci FOR UPDATE (pola penjaga over-receive sisi beli):
  // surat jalan non-batal lain (konsep ikut memesan porsi) + surat jalan
  // ini tidak boleh menembus qty dipesan. DO tetap tidak menyentuh stok —
  // keluar stok hanya lewat posting faktur.
  const deliveryOrder = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${salesOrderId} FOR UPDATE`
    await assertDeliveryWithinOrderCap(tx, {
      salesOrderId,
      requestedByLine: qtyByLine,
    })
    return tx.deliveryOrder.create({
      data: {
        documentNo,
        slug,
        doNumber: v.doNumber ?? null,
        customerId: salesOrder.customerId,
        salesOrderId,
        date: wibDateToUtcMidnight(v.date),
        deliveryDate: v.deliveryDate ? wibDateToUtcMidnight(v.deliveryDate) : null,
        shippingAddress: v.shippingAddress ?? null,
        shippingProvince: v.shippingProvince ?? null,
        shippingCity: v.shippingCity ?? null,
        shippingDistrict: v.shippingDistrict ?? null,
        shippingVillage: v.shippingVillage ?? null,
        shippingPostalCode: v.shippingPostalCode ?? null,
        shippingPhone: v.shippingPhone ?? null,
        vehicleNumber: v.vehicleNumber ?? null,
        notes: v.notes ?? null,
        status: "draft",
        createdBy: Number(user.id),
        items: {
          create: [...qtyByLine.entries()].map(([salesOrderItemId, qty]) => ({
            salesOrderItemId,
            itemId: lineById.get(salesOrderItemId)!.itemId!,
            qty,
          })),
        },
      },
    })
  })

  await logActivity("create", "DeliveryOrder", deliveryOrder.id, `Membuat surat jalan #${deliveryOrder.id}`)
  revalidatePath("/penjualan/surat-jalan")
  return { success: true, id: deliveryOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[createDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * draft → shipped. Surat jalan yang berstatus `shipped`/`delivered` inilah yang
 * dihitung laporan Pemenuhan Pesanan (`SHIPPED_DELIVERY_STATUSES`); tanpa aksi
 * ini semua surat jalan tersangkut di konsep dan laporan selalu 0 terkirim.
 */
export async function shipDeliveryOrder(id: number) {
  try {
  const user = await requirePermission("edit_delivery_orders")

  // TASK-016 BUG-03: klaim kirim menilai ulang cap kumulatif di dalam
  // transaksi dengan baris SO terkunci — dua surat jalan atas SO yang sama
  // yang dikirim bersamaan tidak boleh sama-sama lolos lalu bersama-sama
  // menembus qty dipesan (pola kunci PO di verifikasi penerimaan beli).
  await prisma.$transaction(async (tx) => {
    const existing = await tx.deliveryOrder.findUniqueOrThrow({
      where: { id },
      select: { status: true, documentNo: true, salesOrderId: true },
    })
    if (existing.status !== "draft") {
      throw new Error(
        `Surat jalan ${existing.documentNo} berstatus "${existing.status}" — hanya surat jalan konsep yang bisa ditandai dikirim.`,
      )
    }

    // Mengirim surat jalan TANPA baris barang hanya mengubah label: tak satu pun
    // baris pesanan bertambah terkirim dan sisa kirim tetap salah. Tolak lebih awal
    // dengan sebab yang bisa ditindaklanjuti.
    const itemCount = await tx.deliveryOrderItem.count({ where: { deliveryOrderId: id } })
    if (itemCount === 0) {
      throw new Error(
        "Surat jalan ini tidak punya baris barang, jadi belum bisa ditandai dikirim. Isi barisnya lebih dulu.",
      )
    }

    if (existing.salesOrderId) {
      await tx.$queryRaw`SELECT id FROM sales_orders WHERE id = ${existing.salesOrderId} FOR UPDATE`
      const ownItems = await tx.deliveryOrderItem.findMany({
        where: { deliveryOrderId: id },
        select: { salesOrderItemId: true, itemId: true, qty: true, unit: true },
      })
      const requestedByLine = new Map<number, number>()
      for (const line of ownItems) {
        if (line.salesOrderItemId == null) continue
        const baseQty =
          line.itemId == null
            ? Number(line.qty)
            : Number(line.qty) * (await toBaseFactor(tx, line.itemId, line.unit))
        requestedByLine.set(
          line.salesOrderItemId,
          (requestedByLine.get(line.salesOrderItemId) ?? 0) + baseQty,
        )
      }
      await assertDeliveryWithinOrderCap(tx, {
        salesOrderId: existing.salesOrderId,
        requestedByLine,
        excludeDeliveryOrderId: id,
        shippedOnly: true,
      })
    }

    // Klaim atomik dari `draft` supaya dua klik beruntun tidak memproses dua kali.
    const claim = await tx.deliveryOrder.updateMany({
      where: { id, status: "draft" },
      data: { status: "shipped", confirmedBy: Number(user.id), confirmedAt: new Date() },
    })
    if (claim.count === 0) throw new Error("Surat jalan sudah diproses.")
  })

  await logActivity("ship", "DeliveryOrder", id, `Menandai surat jalan #${id} dikirim`)
  revalidatePath("/penjualan/surat-jalan")
  revalidatePath("/laporan/pemenuhan-pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[shipDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/** shipped → delivered, menstempel `deliveredAt` (barang sudah diterima pelanggan). */
export async function deliverDeliveryOrder(id: number) {
  try {
  await requirePermission("edit_delivery_orders")

  const existing = await prisma.deliveryOrder.findUniqueOrThrow({
    where: { id },
    select: { status: true, documentNo: true },
  })
  if (existing.status !== "shipped") {
    throw new Error(
      `Surat jalan ${existing.documentNo} berstatus "${existing.status}" — tandai dikirim dulu sebelum ditandai terkirim.`,
    )
  }

  const claim = await prisma.deliveryOrder.updateMany({
    where: { id, status: "shipped" },
    data: { status: "delivered", deliveredAt: new Date() },
  })
  if (claim.count === 0) throw new Error("Surat jalan sudah diproses.")

  await logActivity("deliver", "DeliveryOrder", id, `Menandai surat jalan #${id} terkirim`)
  revalidatePath("/penjualan/surat-jalan")
  revalidatePath("/laporan/pemenuhan-pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deliverDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

// ==================== DELETE ACTIONS ====================

export async function deleteQuotation(id: number) {
  try {
  await requirePermission("delete_quotations")

  await prisma.quotation.findUniqueOrThrow({ where: { id } })

  await prisma.$transaction(async (tx) => {
    const salesOrders = await tx.salesOrder.findMany({ where: { quotationId: id }, select: { id: true } })
    const salesOrderIds = salesOrders.map((so) => so.id)
    // P3 vonis F-2026-10-28-121-V: cascade menolak bila ada faktur turunan hidup
    // (non-draft/non-cancelled) — dilarang hapus diam-diam, arahkan void dulu.
    const liveInvoices = await tx.salesInvoice.findMany({
      where: {
        OR: [{ quotationId: id }, { salesOrderId: { in: salesOrderIds.length ? salesOrderIds : [-1] } }],
        status: { notIn: ["draft", "cancelled"] },
      },
      select: { id: true },
    })
    if (liveInvoices.length > 0) {
      throw new Error("Penawaran tidak bisa dihapus: masih ada faktur turunan yang hidup. Batalkan (void) faktur dulu.")
    }
    const invoices = await tx.salesInvoice.findMany({
      where: { OR: [{ quotationId: id }, { salesOrderId: { in: salesOrderIds.length ? salesOrderIds : [-1] } }] },
      select: { id: true },
    })
    const invoiceIds = invoices.map((inv) => inv.id)

    // Reverse GL + stock for each linked invoice before cascading the delete.
    await Promise.all(invoiceIds.map((invId) => reverseSalesInvoicePostingTx(tx, invId)))

    if (invoiceIds.length) await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } })

    if (salesOrderIds.length) await tx.deliveryOrder.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } })
    if (salesOrderIds.length) await tx.salesOrderItem.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } })
    if (salesOrderIds.length) await tx.salesOrder.deleteMany({ where: { id: { in: salesOrderIds } } })

    const workOrders = await tx.workOrder.findMany({ where: { quotationId: id }, select: { id: true, projectId: true } })
    const workOrderIds = workOrders.map((wo) => wo.id)
    const candidateProjectIds = [...new Set(workOrders.map((wo) => wo.projectId).filter((pid): pid is number => pid !== null))]
    if (workOrderIds.length) await tx.workOrderItem.deleteMany({ where: { workOrderId: { in: workOrderIds } } })
    if (workOrderIds.length) await tx.workOrder.deleteMany({ where: { id: { in: workOrderIds } } })
    // Project is shared (WorkOrder.projectId independent of quotationId): only
    // delete candidate projects no longer referenced by any remaining work
    // order. Deleting a shared project would fail FK Restrict on siblings or
    // orphan their project link.
    if (candidateProjectIds.length) {
      const projects = await tx.project.findMany({
        where: { id: { in: candidateProjectIds } },
        select: { id: true, workOrders: { select: { id: true } } },
      })
      const orphanProjectIds = projects.filter((p) => p.workOrders.length === 0).map((p) => p.id)
      if (orphanProjectIds.length) await tx.project.deleteMany({ where: { id: { in: orphanProjectIds } } })
    }

    // Reverse the GL journal of every Down Payment tied to this quotation
    // BEFORE deleting the rows. Without this, the DP journal (Dr Bank / Cr
    // Down Payment liability) stays in the GL with no document behind it, so
    // the balance sheet and cash flow are permanently wrong after a
    // quotation delete. Mirrors deleteDownPayment / deleteSalesPayment, which
    // both call deleteJournalByReferenceTx for their own reference type.
    const downPayments = await tx.downPayment.findMany({
      where: { quotationId: id },
      select: { id: true },
    })
    for (const dp of downPayments) {
      await deleteJournalByReferenceTx(tx, "DownPayment", dp.id)
    }
    await tx.downPayment.deleteMany({ where: { quotationId: id } })
    // Delete quotation sections + items before the quotation itself
    const sections = await tx.quotationSection.findMany({ where: { quotationId: id }, select: { id: true } })
    const sectionIds = sections.map((s) => s.id)
    if (sectionIds.length) await tx.quotationItem.deleteMany({ where: { sectionId: { in: sectionIds } } })
    await tx.quotationSection.deleteMany({ where: { quotationId: id } })
    await tx.quotation.delete({ where: { id } })
  })

  await logActivity("delete", "Quotation", id, `Menghapus penawaran #${id}`)
  revalidatePath("/penjualan/penawaran")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteQuotation]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * FIN-BR-008 (vonis t_9a1c4453): reversal pembayaran penjualan terposting.
 * Dokumen asal TIDAK dihapus: jurnal asal di-reverse lewat
 * reverseJournalsByReferenceTx (bukan deleteJournalByReferenceTx), payment
 * menjadi status reversed + reversedAt/reversedBy/reversalReason, lalu
 * recalc faktur (mengecualikan payment reversed) mengembalikan piutang.
 * Alasan kosong ditolak SEBELUM mutasi apa pun. Bupot aktif = tolak
 * (revoke bupot dulu). Periode jurnal asal terkunci = helper menolak.
 */
export async function reverseSalesPayment(
  id: number,
  reason: string,
  idempotencyKey?: string,
) {
  try {
  const user = await requirePermission("delete_sales_payments")
  const cleanReason = (reason ?? "").trim()
  if (!cleanReason) {
    return { success: false, error: "Alasan pembalikan pembayaran wajib diisi." }
  }
  const key = (idempotencyKey ?? "").trim()
  const userId = Number(user.id)

  const result = await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM sales_payments WHERE id = ${id} FOR UPDATE`
    }
    const fresh = await tx.salesPayment.findUniqueOrThrow({ where: { id } })
    if (fresh.status === "reversed") {
      throw new Error("Pembayaran penjualan ini sudah dibalik.")
    }

    if (key) {
      const claim = await claimIdempotencyKey(
        tx as never,
        "sales_payment_reverse",
        key,
        userId,
        payloadFingerprint({ paymentId: id, reason: cleanReason }),
      )
      if (claim.replayed) return { id, replayed: true as const, amount: Number(fresh.amount), salesInvoiceId: fresh.salesInvoiceId }
    }

    // Syarat 9 vonis: bupot aktif wajib di-revoke dulu (revoke me-reverse
    // jurnal SalesPayment per bupot; reversal sesudahnya akan ganda).
    const activeBupot = await tx.withholdingCertificate.findFirst({
      where: { salesPaymentId: id, status: { not: "revoked" } },
      select: { id: true, certificateNumber: true },
    })
    if (activeBupot) {
      throw new Error(
        `Pembayaran ini memiliki bukti potong aktif (${activeBupot.certificateNumber}). Batalkan bukti potong terlebih dahulu sebelum membalik pembayaran.`,
      )
    }

    await reverseJournalsByReferenceTx(tx, "SalesPayment", id, cleanReason, userId)

    await tx.salesPayment.update({
      where: { id },
      data: {
        status: "reversed",
        reversedAt: new Date(),
        reversedBy: userId,
        reversalReason: cleanReason,
      },
    })

    if (fresh.salesInvoiceId) {
      await onSalesPaymentDeleted(fresh.salesInvoiceId, tx)
    }
    if (key) {
      await bindIdempotencyKey(tx as never, key, "SalesPayment", id)
    }
    return { id, replayed: false as const, amount: Number(fresh.amount), salesInvoiceId: fresh.salesInvoiceId }
  })

  await logActivity(
    "reverse",
    "SalesPayment",
    id,
    `Pembalikan pembayaran penjualan #${id} sebesar ${result.amount}: ${cleanReason}`,
  )
  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true, id: result.id, replayed: result.replayed }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[reverseSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesPayment(id: number) {
  try {
  await requirePermission("delete_sales_payments")

  // FIN-BR-008 syarat 8: hapus fisik HANYA pembayaran yang jurnalnya belum
  // POSTED. Terposting = wajib reversal berhistori (reverseSalesPayment).
  // Baca + kunci baris di dalam tx (pola vendor; sebelumnya baca luar tx).
  let removedFiles: { fileUrl: string; referenceType: string }[] = []
  let salesInvoiceId: number | null = null
  await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM sales_payments WHERE id = ${id} FOR UPDATE`
    }
    const fresh = await tx.salesPayment.findUniqueOrThrow({ where: { id } })
    if (fresh.status === "reversed") {
      throw new Error(
        "Pembayaran yang sudah dibalik tidak dapat dihapus; histori reversal wajib dipertahankan.",
      )
    }
    const postedJournal = await tx.journal.findFirst({
      where: { referenceType: "SalesPayment", referenceId: id, status: "POSTED" },
      select: { id: true },
    })
    if (postedJournal) {
      throw new Error(
        "Pembayaran terposting tidak dapat dihapus. Gunakan pembalikan (reversal) agar histori dan alasan tersimpan.",
      )
    }
    salesInvoiceId = fresh.salesInvoiceId

    // Reverse the cash-receipt journal (Dr Cash / Cr Piutang) before removing the
    // record, otherwise the GL keeps cash/receivable overstated. Mirrors the
    // vendor-payment delete path.
    await deleteJournalByReferenceTx(tx, "SalesPayment", id)

    removedFiles = await deleteTransactionAttachmentsTx(tx, {
      referenceType: "sales_payment", referenceId: id,
    })
    await tx.salesPayment.delete({ where: { id } })

    // Recalculate invoice after payment deletion
    if (salesInvoiceId) {
      await onSalesPaymentDeleted(salesInvoiceId, tx)
    }
  })
  await removeAttachmentFiles(removedFiles)

  await logActivity("delete", "SalesPayment", id, `Menghapus pembayaran penjualan #${id}`)
  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDeliveryOrder(id: number) {
  try {
  await requirePermission("delete_delivery_orders")

  // Status guard: a DeliveryOrder with confirmedAt or deliveredAt stamped is a
  // completed logistics record (the customer already received the goods or the
  // courier already confirmed pickup). Hard-deleting it erases the audit trail
  // — the linked SalesOrder's status transition history loses its trigger row,
  // and the printed "Tanda Terima" PDF no longer reconciles to any document.
  // Mirrors the sibling deleteDownPayment("Hanya down payment draft yang bisa
  // dihapus") guard. The schema carries confirmedBy / confirmedAt / deliveredAt
  // precisely as the immutability record for this row.
  const existing = await prisma.deliveryOrder.findUniqueOrThrow({
    where: { id },
    select: { status: true },
  })
  if (existing.status !== "draft") {
    throw new Error(
      `Surat jalan berstatus "${existing.status}" tidak dapat dihapus; hanya draft yang boleh dihapus agar jejak audit (confirmed/delivered) tidak hilang.`
    )
  }

  await prisma.deliveryOrder.delete({ where: { id } })

  await logActivity("delete", "DeliveryOrder", id, `Menghapus surat jalan #${id}`)
  revalidatePath("/penjualan/surat-jalan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteDownPayment(id: number) {
  try {
  await requirePermission("delete_down_payments")

  await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM down_payments WHERE id = ${id} FOR UPDATE`
    }
    const dp = await tx.downPayment.findUniqueOrThrow({ where: { id } })
    if (dp.status !== "draft") {
      throw new Error("Hanya uang muka berstatus draf yang bisa dihapus")
    }

    // Reverse any journal posted at draft creation before removing the record.
    await deleteJournalByReferenceTx(tx, "DownPayment", id)
    await tx.downPayment.delete({ where: { id } })
  })

  await logActivity("delete", "DownPayment", id, `Menghapus uang muka #${id}`)
  revalidatePath("/penjualan/uang-muka")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}


export async function updateSalesOrder(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_sales_orders")

  const parsed = parseFormData(updateSalesOrderSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const existingForSlug = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, select: { documentNo: true } })
  const slug = await nextSlug("salesOrder", existingForSlug.documentNo, { excludeId: id })

  const itemsJson = v.items
  const items = itemsJson
    ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number; description?: string | null }>>(itemsJson) ?? [])
    : null

  const salesOrder = await prisma.$transaction(async (tx) => {
    const existing = await tx.salesOrder.findUniqueOrThrow({ where: { id } })
    // Custom fabrication: the order's items may change until the customer
    // actually pays. A confirmed/processing order is still editable while only a
    // down payment has been received; it locks once a real (non-DP) payment
    // exists on a linked invoice.
    if (existing.status === "cancelled" || existing.status === "completed") {
      throw new Error(`Sales Order berstatus '${existing.status}' tidak bisa diubah`)
    }
    if (await salesOrderHasRealSettlement(id, tx)) {
      throw new Error("Sales Order sudah ada pelunasan, item tidak bisa diubah lagi")
    }

    // Fix #1: UPDATE bukan CREATE, dan jangan generate documentNo baru
    const updated = await tx.salesOrder.update({
      where: { id },
      data: {
        slug,
        customerId: v.customerId,
        // Pertahankan tautan penawaran bila payload tidak memuatnya — menulis
        // `?? null` menghapus tautan itu pada setiap penyimpanan.
        quotationId: v.quotationId ?? existing.quotationId,
                date: wibDateToUtcMidnight(v.date),
        deliveryDate: v.deliveryDate ? wibDateToUtcMidnight(v.deliveryDate) : null,
        notes: v.notes ?? null,
      },
      include: { items: true },
    })

    // If items provided, replace them and recompute totals. Per-line values are
    // clamped to >= 0 so a tampered client cannot persist a negative line that
    // would later flow into delivery/invoice.
    if (items !== null) {
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } })

      if (items.length > 0) {
        await tx.salesOrderItem.createMany({
          data: items.map((item) => {
            const safeQty = Math.max(0, Number(item.qty) || 0)
            const safePrice = Math.max(0, Number(item.unitPrice) || 0)
            const safeDiscount = Math.max(0, Number(item.discount) || 0)
            return {
              salesOrderId: id,
              itemId: item.itemId,
              description: item.description ?? null,
              qty: safeQty,
              unitPrice: safePrice,
              discount: safeDiscount,
              total: Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)),
            }
          }),
        })
      }

      const subtotal = items.reduce((sum, item) => {
        const safeQty = Math.max(0, Number(item.qty) || 0)
        const safePrice = Math.max(0, Number(item.unitPrice) || 0)
        const safeDiscount = Math.max(0, Number(item.discount) || 0)
        return safeAdd(sum, Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)), 0)
      }, 0)
      const taxRate = v.taxRate !== undefined ? Math.max(0, v.taxRate) : 0
      const discountTotal = Math.min(Math.max(0, v.discount ?? 0), subtotal)
      const taxAmount = safeRound(safeDivide(safeMultiply(safeSubtract(subtotal, discountTotal, 0), taxRate, 4), 100, 4), 0)
      const grandTotal = safeSubtract(safeAdd(subtotal, taxAmount, 0), discountTotal, 0)

      // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 6: hanya delta naik
      // dinilai (EC-CL2-4 ubahan turun bebas). Penilaian sebelum tulis
      // total; tertahan = rollback seluruh ubahan.
      if (grandTotal > Number(existing.grandTotal)) {
        const updAttempt = {
          customerId: v.customerId,
          documentType: "sales_order" as const,
          attemptedAmount: grandTotal,
          requestedBy: Number(user.id),
          quotationId: v.quotationId ?? existing.quotationId,
          existingDocumentId: id,
          requestReason: v.creditOverrideReason ?? null,
        }
        const updOverrideId = assertCreditGatePassed(
          await assessCreditGateInTx(tx, updAttempt),
        )
        if (updOverrideId != null) {
          await consumeApprovedCreditOverrideInTx(tx, updOverrideId, updAttempt, {
            id,
            documentNo: existing.documentNo,
          })
        }
      }

      await tx.salesOrder.update({
        where: { id },
        data: { subtotal, discount: discountTotal, tax: taxAmount, grandTotal, totalAmount: grandTotal },
      })
    }

    return updated
  })

  await logActivity("update", "SalesOrder", salesOrder.id, `Memperbarui pesanan penjualan #${salesOrder.id}`)
  revalidatePath("/penjualan/pesanan")
  return { success: true, id: salesOrder.id, slug }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[updateSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesInvoice(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_sales_invoices")

  const parsed = parseFormData(updateSalesInvoiceSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  // Lapis-2: tanggal baru harus di periode terbuka, sebelum mutasi apa pun —
  // termasuk sebelum reverse+repost jalur wasPosted di dalam transaksi.
  await assertPeriodOpen(wibDateToUtcMidnight(v.date))

  const itemsJson = v.items
  const items = itemsJson ? (safeJsonParse<Array<{ itemId: number | null; qty: number; unitPrice: number; discount?: number; uom?: string | null; serialNumbers?: string[] | null; description?: string | null }>>(itemsJson) ?? []) : null

  const existingForSlug = await prisma.salesInvoice.findUniqueOrThrow({ where: { id }, select: { documentNo: true } })
  // K5: draft belum bernomor -> slug tetap null (URL fallback id).
  const slug = existingForSlug.documentNo
    ? await nextSlug("salesInvoice", existingForSlug.documentNo, { excludeId: id })
    : null

  const result = await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${id} FOR UPDATE`
    }
    const existingInvoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id } })
    // Custom fabrication: items may change until the customer actually pays. The
    // invoice stays editable after posting (stock/GL already booked) as long as
    // no real (non-DP) payment exists — the edit reverses and re-posts below.
    // A down payment alone does NOT lock it; it is only reconciled at the end.
    if (existingInvoice.status === "cancelled") {
      throw new Error("Faktur yang sudah dibatalkan tidak bisa diubah")
    }
    if (await hasRealSettlement(id, tx)) {
      throw new Error("Faktur sudah ada pelunasan, item tidak bisa diubah lagi")
    }
    // Whether the invoice already moved stock / posted GL (needs reverse+repost
    // when items change). draft/approved never posted; posted/partial/sent/paid
    // have. (paid can't reach here — the settlement guard above rejects it.)
    const wasPosted = existingInvoice.status !== "draft" && existingInvoice.status !== "approved"
    // Update header
    const invoice = await tx.salesInvoice.update({
      where: { id },
      data: {
        slug,
        customerId: v.customerId,
        salesOrderId: v.salesOrderId ?? null,
        // quotationId tidak punya input di form faktur (ia tautan sistem dari
        // konversi Penawaran). Menulis `?? null` di sini menghapus tautan itu
        // setiap kali faktur diedit, jadi nilai lama dipertahankan bila payload
        // tidak memuatnya.
        quotationId: v.quotationId ?? existingInvoice.quotationId,
        date: wibDateToUtcMidnight(v.date),
        dueDate: v.dueDate ? wibDateToUtcMidnight(v.dueDate) : null,
        taxInvoiceNumber: v.taxInvoiceNumber ?? null,
        // Persist notes: the sales-invoice form exposes a notes textarea
        // but the previous data block silently dropped the value, so the
        // user's note input was never saved on edit.
        notes: v.notes ?? null,
      },
    })

    // If items provided, replace all items and recalculate totals
    if (items !== null) {
      // Delete existing items
      await tx.salesInvoiceItem.deleteMany({
        where: { salesInvoiceId: id },
      })

      // Insert new items
      if (items.length > 0) {
        await tx.salesInvoiceItem.createMany({
          data: items.map((item, idx) => {
            // Clamp per-line fields to >= 0: a negative qty/unitPrice/discount
            // sent by a tampered client (updateSalesInvoice does NOT run the
            // zod schema) would otherwise persist a negative item row. Negative
            // qty at posting time would credit stock back to the warehouse
            // (qty_on_hand = qty_on_hand - negative = +stock), inflating
            // inventory and posting a negative AR/revenue GL.
            const safeQty = Math.max(0, Number(item.qty) || 0)
            const safePrice = Math.max(0, Number(item.unitPrice) || 0)
            const safeDiscount = Math.max(0, Number(item.discount) || 0)
            return {
              salesInvoiceId: id,
              itemId: item.itemId,
              description: item.description ?? null,
              qty: safeQty,
              uom: item.uom || null,
              unitPrice: safePrice,
              discount: safeDiscount,
              total: Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)),
              sortOrder: idx,
              serialNumbers: item.serialNumbers && item.serialNumbers.length > 0 ? item.serialNumbers : undefined,
            }
          }),
        })
      }

      // Recalculate totals. Clamp each line to >= 0 so a flat discount larger
      // than the line subtotal can't drive the stored total/subtotal (and the
      // posted AR/revenue GL) negative. Mirrors the quotation computeLine clamp.
      const subtotal = items.reduce((sum, item) => {
        const safeQty = Math.max(0, Number(item.qty) || 0)
        const safePrice = Math.max(0, Number(item.unitPrice) || 0)
        const safeDiscount = Math.max(0, Number(item.discount) || 0)
        return safeAdd(sum, Math.max(0, safeSubtract(safeMultiply(safeQty, safePrice, 0), safeDiscount, 0)), 0)
      }, 0)
      // Clamp taxRate to >= 0: a negative rate would produce a negative
      // taxAmount and a negative grandTotal, which then posts a negative
      // AR/revenue journal. The header discount is already clamped to
      // [0, subtotal] below; taxRate was the missing counterpart.
      const taxRate = v.taxRate !== undefined ? Math.max(0, v.taxRate) : 0
      // Clamp the header discount to [0, subtotal] so a discount larger than the
      // line subtotal can't drive the taxable base, taxAmount, or grandTotal
      // negative (which would post a negative AR/revenue GL). Mirrors the
      // per-line clamp above.
      const rawDiscount = v.discount ?? 0
      const discountTotal = Math.min(Math.max(0, rawDiscount), subtotal)
      const taxAmount = safeRound(safeDivide(safeMultiply(safeSubtract(subtotal, discountTotal, 0), taxRate, 4), 100, 4), 0)
      const grandTotal = safeSubtract(safeAdd(subtotal, taxAmount, 0), discountTotal, 0)

      // F-2026-10-25-035-B titik tahan Q-CL2-4 butir 6: hanya delta naik
      // dinilai sebelum tulis/repost; tertahan = rollback seluruh ubahan.
      if (grandTotal > Number(existingInvoice.grandTotal)) {
        const updInvAttempt = {
          customerId: v.customerId,
          documentType: "sales_invoice" as const,
          attemptedAmount: grandTotal,
          requestedBy: Number(user.id),
          quotationId: v.quotationId ?? existingInvoice.quotationId,
          salesOrderId: v.salesOrderId ?? existingInvoice.salesOrderId,
          existingDocumentId: id,
          requestReason: v.creditOverrideReason ?? null,
        }
        const updInvOverrideId = assertCreditGatePassed(
          await assessCreditGateInTx(tx, updInvAttempt),
        )
        if (updInvOverrideId != null) {
          await consumeApprovedCreditOverrideInTx(tx, updInvOverrideId, updInvAttempt, {
            id,
            documentNo: existingInvoice.documentNo,
          })
        }
      }

      // Get current paidAmount to determine payment status
      const current = await tx.salesInvoice.findUniqueOrThrow({ where: { id }, select: { paidAmount: true } })
      const paidAmount = Number(current.paidAmount ?? 0)

      // FIN-BR-006: lunas dari outstanding valid dalam toleransi Rp1.
      let paymentStatus: string = "unpaid"
      if (isSettled(grandTotal, paidAmount)) {
        paymentStatus = "paid"
      } else if (paidAmount > 0) {
        paymentStatus = "partial"
      }

      // F-2026-10-25-036-S (lanjutan BLOCKER-1): edit item dapat menaikkan
      // status ke paid (grandTotal turun <= paidAmount lama, mis. DP penuh)
      // tanpa melewati jalur pembayaran — bekukan snapshot tarif komisi
      // lewat helper bersama; snapshot existing tidak pernah ditimpa dan
      // transisi turun/tetap tidak menulis snapshot (helper mengembalikan {}).
      const commissionSnapshot = await commissionSnapshotForPaid(
        tx,
        {
          id,
          customerId: v.customerId,
          date: wibDateToUtcMidnight(v.date),
          commissionRatePercent: existingInvoice.commissionRatePercent ?? null,
        },
        paymentStatus === "paid",
      )

      await tx.salesInvoice.update({
        where: { id },
        data: {
          subtotal,
          discount: discountTotal,
          // Store the PPN AMOUNT in `tax` (not the rate) so the field carries
          // the same meaning on every write path (DP/quotation paths already
          // store the amount). Keeps tax === taxAmount and prevents the report /
          // editor from ever reading a bare rate as if it were the amount.
          tax: taxAmount,
          taxAmount,
          grandTotal,
          totalAmount: grandTotal,
          paymentStatus,
          ...commissionSnapshot,
        },
      })

      // TASK-016 BUG-06: edit baris adalah lahir-ulang faktur — cap
      // kumulatif SO dinilai lagi SEBELUM reverse+repost di bawah, faktur
      // ini dikeluarkan dari total berjalan.
      if (v.salesOrderId) {
        await assertInvoiceWithinSalesOrderCap(tx, {
          salesOrderId: v.salesOrderId,
          excludeInvoiceId: id,
          candidateGrandTotal: grandTotal,
          candidateLines: items.map((item) => ({
            itemId: item.itemId,
            qty: Number(item.qty),
            uom: item.uom ?? null,
          })),
        })
      }

      // If the invoice already posted (stock-out + AR/revenue + COGS journals),
      // the item change invalidated every one of those entries. Reverse them and
      // re-post from the new lines, atomically inside this tx — mirroring the
      // vendor-bill edit pattern (delete journals by reference, then re-invoke
      // the posting hook) plus the stock reversal a sales invoice additionally
      // needs. `reverseSalesInvoicePostingTx` restores qtyOnHand + FIFO layers
      // and deletes the SalesInvoice/SalesInvoiceCOGS journals; onSalesInvoicePosted
      // (idempotent) then re-books them from the current invoice rows.
      if (wasPosted) {
        await reverseSalesInvoicePostingTx(tx, id, { reversePaymentJournals: false })
        await onSalesInvoicePosted(id, Number(user.id), tx)
      }
    }

    return invoice
  })

  await logActivity("update", "SalesInvoice", result.id, `Memperbarui faktur penjualan #${result.id}`)
  revalidatePath("/penjualan/faktur")
  return { success: true, id: result.id, slug }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    const blocked = await creditGateBlockedResult(e)
    if (blocked) return blocked
    console.error("[updateSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesPayment(id: number, formData: FormData) {

  "use server"

  try {
  const user = await requirePermission("edit_sales_payments")

  const parsed = parseFormData(updateSalesPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  // Old payment row + slug: NO lookup outside the tx. A concurrent delete/edit
  // of this payment between an outer read and the tx would make the recalc
  // below act on stale data (or the update hit a ghost row). Slug derives
  // from the locked row's documentNo inside the tx.
  const newInvoiceId = v.salesInvoiceId
  const newAmount = v.amount
  const newWithholdingAmount = v.withholdingAmount ?? 0
  if (newWithholdingAmount > 0 && !v.withholdingTypeId) {
    return { success: false, error: "Jenis PPh wajib dipilih bila ada potongan PPh" }
  }

  // Atomic: lock the target invoice and validate the edited amount against the
  // remaining balance (excluding THIS payment) — mirrors createSalesPayment.
  // Previously the edit path did a bare update with no overpay guard, so a
  // payment could be raised past the invoice grandTotal, silently corrupting AR.
  // The recalc (onSalesPaymentUpdated) and attachment linkage are now ALSO
  // inside this tx so a failure rolls back the payment update + GL repost
  // together — otherwise the invoice's paidAmount could be left stale relative
  // to the payment row, and the operator's just-uploaded attachments would
  // silently never get linked to the edited payment.
  const payment = await prisma.$transaction(async (tx) => {
    // Lock BOTH invoices up front, id-sorted (anti-deadlock): two concurrent
    // reassigns swapping invoices A<->B must take locks in the same order.
    // Old row read here (not outside): baca luar + lock hanya baru = TOCTOU —
    // pesaing bisa hapus/pindah payment ini atau ubah faktur lama di antaranya.
    const lockedPayment = await tx.salesPayment.findUniqueOrThrow({
      where: { id },
      select: { salesInvoiceId: true, documentNo: true, status: true },
    })
    // FIN-BR-008: pembayaran reversed = histori read-only, tidak boleh diedit.
    if (lockedPayment.status === "reversed") {
      throw new Error(
        "Pembayaran yang sudah dibalik tidak dapat diubah; histori reversal wajib dipertahankan.",
      )
    }
    const oldInvoiceId = lockedPayment.salesInvoiceId
    const invoiceIds = oldInvoiceId === newInvoiceId
      ? [newInvoiceId]
      : [Math.min(oldInvoiceId, newInvoiceId), Math.max(oldInvoiceId, newInvoiceId)]
    for (const invoiceId of invoiceIds) {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${invoiceId} FOR UPDATE`
    }
    const slug = await nextSlug("salesPayment", lockedPayment.documentNo, { excludeId: id })

    const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: newInvoiceId } })

    // Status guard: reject invoices that were never posted (draft/approved) or
    // were voided (cancelled) — otherwise an edit could move a payment onto such
    // an invoice and repost its cash-receipt journal against it, booking an
    // AR/GL entry for an invoice that is not posted.
    //
    // Do NOT mirror createSalesPayment's ["posted","partial"] allowlist here:
    // a payment that settled its invoice leaves the invoice at "paid", so that
    // allowlist would block the normal case of correcting the amount/date/account
    // of a payment whose invoice is already fully paid. The overpay guard below
    // already excludes this payment from the sum, so it stays correct for "paid".
    if (["draft", "approved", "cancelled"].includes(invoice.status)) {
      throw new Error(
        `Pembayaran hanya bisa diubah untuk invoice yang sudah diposting (status saat ini: ${invoice.status})`
      )
    }

    // Sum of all OTHER payments already allocated to the target invoice.
    // Potongan PPh pelanggan ikut melunasi piutang, jadi jumlahnya harus masuk
    // hitungan — kalau hanya `amount`, faktur yang dipotong PPh bisa terlihat
    // masih punya sisa padahal sudah lunas (dan sebaliknya, edit bisa melebihi).
    const others = await tx.salesPayment.aggregate({
      // FIN-BR-008: baris `reversed` tetap ada di tabel. Tanpa saringan ini
      // nilai pembayaran yang sudah dibatalkan ikut dihitung sebagai pelunasan,
      // sehingga pembayaran pengganti ditolak "melebihi sisa tagihan".
      where: activeSalesPaymentWhere({ salesInvoiceId: newInvoiceId, id: { not: id } }),
      _sum: { amount: true, withholdingAmount: true },
    })
    const otherPaid = safeAdd(Number(others._sum.amount ?? 0), Number(others._sum.withholdingAmount ?? 0))
    const remaining = safeSubtract(invoice.grandTotal, otherPaid, 0)
    const settled = safeAdd(newAmount, newWithholdingAmount)
    // FIN-BR-006: kelebihan dalam toleransi lunas Rp1 adalah pembulatan
    // rupiah-penuh, bukan overpay — jangan tolak. Di atas itu tetap tolak.
    if (settled > remaining + SETTLEMENT_TOLERANCE_IDR) {
      throw new Error(
        newWithholdingAmount > 0
          ? `Jumlah pembayaran + potongan PPh (${settled}) melebihi sisa tagihan (${remaining})`
          : `Jumlah pembayaran melebihi sisa tagihan (${remaining})`,
      )
    }

    if (v.accountId != null) {
      const ok = await tx.account.count({ where: { id: v.accountId } })
      if (!ok) throw new Error(`Akun tidak ditemukan (id: ${v.accountId}). Pilih ulang akun sebelum menyimpan.`)
    }

    const updated = await tx.salesPayment.update({
      where: { id },
      data: {
        slug,
        salesInvoiceId: newInvoiceId,
        amount: newAmount,
        paymentDate: wibDateToUtcMidnight(v.paymentDate),
        paymentMethod: v.paymentMethod,
        accountId: v.accountId ?? null,
        withholdingTypeId: v.withholdingTypeId ?? null,
        withholdingAmount: newWithholdingAmount,
        withholdingCertificateNo: v.withholdingCertificateNo ?? null,
        withholdingDate: v.withholdingDate ? wibDateToUtcMidnight(v.withholdingDate) : null,
        referenceNo: v.referenceNo ?? null,
        notes: v.notes ?? null,
      },
    })

    // Keep the GL in sync with the edited amount/account/invoice: reverse the old
    // cash-receipt journal and repost it from the updated payment. Both run INSIDE
    // this transaction so a failing repost (closed period, misconfigured account)
    // rolls back the delete — otherwise the payment would be left with no journal,
    // understating cash and overstating AR. Delete first so onSalesPaymentCreated's
    // idempotency guard doesn't skip the repost.
    await deleteJournalByReferenceTx(tx, "SalesPayment", id)
    await onSalesPaymentCreated(updated.id, Number(user.id), tx)

    // Recalculate the (now) target invoice inside the tx so a failed recompute
    // rolls back the edit. Was previously called AFTER the $transaction commit
    // — a recalc failure there would leave the invoice's paidAmount/status
    // stale relative to the new payment row. onSalesPaymentUpdated accepts an
    // optional txClient; pass tx so the recalc joins the same atomic unit.
    await onSalesPaymentUpdated(updated.salesInvoiceId, tx)
    // If the payment was reassigned to a different invoice, the old invoice also
    // needs a recalc — must happen inside the same tx for the same reason.
    // oldInvoiceId comes from the in-tx locked row above (not a stale read).
    if (oldInvoiceId && oldInvoiceId !== updated.salesInvoiceId) {
      await onSalesPaymentUpdated(oldInvoiceId, tx)
    }

    // Associate uploaded attachments inside the tx (moved from outside) so a
    // failed linkage rolls back the payment edit + GL repost rather than
    // leaving a committed payment without its supporting docs.
    const attachmentIds = v.attachmentIds
    if (attachmentIds) {
      await attachPendingTransactionAttachments(tx, {
        attachmentIds, referenceType: "sales_payment", referenceId: updated.id, uploadedBy: Number(user.id),
      })
    }

    return updated
  })

  await logActivity("update", "SalesPayment", payment.id, `Memperbarui pembayaran penjualan #${payment.id}`)
  revalidatePath("/penjualan/pembayaran")
  revalidatePath("/penjualan/faktur")
  return { success: true, id: payment.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateSalesReturn(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_sales_returns")

  const parsed = parseFormData(updateSalesReturnSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const input = parsed.data

  const existingReturn = await prisma.salesReturn.findUnique({
    where: { id },
    select: { status: true, documentNo: true },
  })
  if (!existingReturn) throw new Error("Retur tidak ditemukan")
  if (existingReturn.status !== "draft") {
    throw new Error("Hanya retur berstatus draft yang dapat diedit")
  }

  const slug = await nextSlug("salesReturn", existingReturn.documentNo, { excludeId: id })

  // Fix #10: Jangan generate documentNo baru, hapus items lama dulu
  const itemsJson = input.items
  const validReturnItems = parseSalesReturnItems(itemsJson)
  const updReturnIds = validReturnItems.map((it) => it.itemId)
  const updReturnCostRows = updReturnIds.length
    ? await prisma.item.findMany({ where: { id: { in: updReturnIds } }, select: { id: true, cost: true, price: true } })
    : []
  const baseUpdReturnCostMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.cost ?? 0)]))
  const baseUpdMasterPriceMap = new Map(updReturnCostRows.map((r) => [r.id, Number(r.price ?? 0)]))
  const updInvoiceId = input.salesInvoiceId ?? null
  // Gerbang status faktur yang sama dengan createSalesReturn.
  if (updInvoiceId) {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: updInvoiceId },
      select: { status: true },
    })
    if (!invoice) throw new Error("Faktur tidak ditemukan")
    if (!(RETURNABLE_INVOICE_STATUSES as readonly string[]).includes(invoice.status)) {
      throw new Error(`Faktur berstatus '${invoice.status}' tidak bisa diretur`)
    }
  }
  const updInvoicePriceMap = new Map<number, number>()
  const updInvoiceUomByItem = new Map<number, string | null>()
  if (updInvoiceId) {
    const invItems = await prisma.salesInvoiceItem.findMany({
      where: { salesInvoiceId: updInvoiceId, itemId: { in: updReturnIds.length ? updReturnIds : [-1] } },
      select: { itemId: true, unitPrice: true, uom: true },
    })
    for (const it of invItems) {
      if (it.itemId == null) continue
      updInvoicePriceMap.set(it.itemId, Number(it.unitPrice))
      updInvoiceUomByItem.set(it.itemId, it.uom)
    }
  }
  const updFactorRows = await Promise.all(updReturnIds.map(async (itemId) => [itemId, await toBaseFactor(prisma, itemId, updInvoiceUomByItem.get(itemId))] as const))
  const updFactorByItem = new Map(updFactorRows)
  const updReturnCostMap = new Map([...baseUpdReturnCostMap].map(([itemId, cost]) => [itemId, cost * (updFactorByItem.get(itemId) ?? 1)]))
  const updMasterPriceMap = new Map([...baseUpdMasterPriceMap].map(([itemId, price]) => [itemId, price * (updFactorByItem.get(itemId) ?? 1)]))
  const resolveUpdPrice = (itemId: number) =>
    updInvoicePriceMap.get(itemId) ?? (updMasterPriceMap.get(itemId) || updReturnCostMap.get(itemId) || 0)

  // Retur tanpa barang tidak sah — dan menolaknya di sini juga mencegah kehilangan
  // data: blok di bawah menghapus SELURUH item lalu menulis ulang dari daftar ini,
  // jadi daftar kosong akan menghapus semua baris secara senyap (pernah terjadi
  // ketika halaman Ubah tidak mengirim `items` sehingga form jatuh ke satu baris
  // kosong yang tersaring habis oleh filter itemId > 0).
  if (validReturnItems.length === 0) {
    throw new Error("Retur harus memiliki minimal satu barang")
  }

  // Over-return guard (mirrors createSalesReturn). Must run INSIDE the locked
  // transaction to prevent TOCTOU: two concurrent draft edits (or an edit
  // racing a concurrent create) could each read a stale `alreadyReturned`
  // total, both pass the cap, and on completeSalesReturn over-restock
  // inventory + over-credit AR. createSalesReturn was hardened to lock the
  // invoice FOR UPDATE before re-querying prior returns; this update path
  // mirrors that. Prior non-cancelled returns EXCLUDE this return's own id
  // (its existing rows are about to be deleted/replaced; counting them would
  // double-count).
  const salesReturn = await prisma.$transaction(async (tx) => {
    if (updInvoiceId) {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${updInvoiceId} FOR UPDATE`

      const txInvItems = await tx.salesInvoiceItem.findMany({
        where: { salesInvoiceId: updInvoiceId, itemId: { in: updReturnIds.length ? updReturnIds : [-1] } },
        select: { itemId: true, qty: true, unitPrice: true },
      })
      const txInvoicedQtyByItem = new Map<number, number>()
      const txInvoicePriceMap = new Map<number, number>()
      for (const it of txInvItems) {
        if (it.itemId == null) continue
        txInvoicedQtyByItem.set(it.itemId, (txInvoicedQtyByItem.get(it.itemId) ?? 0) + Number(it.qty))
        if (!txInvoicePriceMap.has(it.itemId)) txInvoicePriceMap.set(it.itemId, Number(it.unitPrice))
      }
      // Merge newly-fetched invoice price map (tx-snapshot) over the pre-tx
      // map so the price resolution below reflects the locked state too.
      for (const [k, v] of txInvoicePriceMap) updInvoicePriceMap.set(k, v)

      const txPriorReturns = await tx.salesReturnItem.findMany({
        where: {
          salesReturn: { salesInvoiceId: updInvoiceId, status: { not: "cancelled" }, id: { not: id } },
          itemId: { in: updReturnIds.length ? updReturnIds : [-1] },
        },
        select: { itemId: true, qty: true },
      })
      const txAlreadyReturnedByItem = new Map<number, number>()
      for (const r of txPriorReturns) {
        txAlreadyReturnedByItem.set(r.itemId, (txAlreadyReturnedByItem.get(r.itemId) ?? 0) + Number(r.qty))
      }

      const txViolation = findOverReturn(
        validReturnItems.map((it) => ({ itemId: it.itemId, qty: it.qty })),
        txInvoicedQtyByItem,
        txAlreadyReturnedByItem
      )
      if (txViolation) {
        if (txViolation.type === "not_on_invoice") {
          throw new Error(`Item #${txViolation.itemId} tidak ada pada faktur yang dipilih, tidak bisa diretur.`)
        }
        throw new Error(
          `Jumlah retur item #${txViolation.itemId} melebihi yang difakturkan ` +
          `(difakturkan: ${txViolation.invoiced}, sudah diretur: ${txViolation.alreadyReturned}, sisa: ${txViolation.remaining}).`
        )
      }
    }

    // Re-validate status under lock: prevents editing a return that another
    // concurrent process just moved out of draft.
    const latest = await tx.salesReturn.findUnique({ where: { id }, select: { status: true } })
    if (!latest || latest.status !== "draft") {
      throw new Error("Hanya retur berstatus draft yang dapat diedit")
    }

    // Delete existing items to prevent duplicates
    await tx.salesReturnItem.deleteMany({
      where: { salesReturnId: id },
    })

    return tx.salesReturn.update({
      where: { id },
      data: {
        slug,
        salesInvoiceId: updInvoiceId,
        customerId: input.customerId,
        date: wibDateToUtcMidnight(input.date),
        reason: input.reason ?? null,
        taxReturnNoteNumber: input.taxReturnNoteNumber ?? null,
        taxReturnNoteDate: input.taxReturnNoteDate ? wibDateToUtcMidnight(input.taxReturnNoteDate) : null,
        items: {
          create: validReturnItems
            .map((item) => ({
              itemId: item.itemId,
              // qty sudah angka ter-parse (helper parseSalesReturnItems):
              // "2.000" tiba sebagai 2000, bukan menyusut jadi 2 / NaN->0.01.
              qty: item.qty,
              cost: updReturnCostMap.get(item.itemId) ?? 0,
              price: resolveUpdPrice(item.itemId),
              // P1-1: identitas fisik yang benar-benar kembali.
              serialNumbers: item.serialNumbers,
              batchNumbers: item.batchNumbers,
            })),
        },
      },
    })
  })

  await logActivity("update", "SalesReturn", salesReturn.id, `Memperbarui retur penjualan #${salesReturn.id}`)
  revalidatePath("/penjualan/retur")
  return { success: true, id: salesReturn.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateDeliveryOrder(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_delivery_orders")

  // Validate via the same Zod schema as createDeliveryOrder so the date/string-length/
  // salesOrderId guards are enforced on the update path. The previous hand-rolled
  // formData.get() chain bypassed parseFormData(updateDeliveryOrderSchema) entirely —
  // a draft editor could push arbitrary strings into `date` (crashing new Date()),
  // non-numeric salesOrderId, or 5MB notes with no enforcement.
  const parsed = parseFormData(updateDeliveryOrderSchema, formData)
  if (!parsed.success) {
    return { success: false, error: `Validasi gagal: ${parsed.error}` }
  }
  const v = parsed.data

  // TASK-016 BUG-10: gerbang status di server, di dalam transaksi dengan
  // baris surat jalan terkunci. Surat jalan shipped/delivered adalah
  // catatan logistik final (barang sudah keluar/diterima) — mengeditnya
  // atau memindahnya ke SO lain menggeser angka terkirim laporan
  // Pemenuhan dari pesanan asal tanpa jejak. Hanya konsep yang boleh
  // diedit, dan SO tujuan tunduk gerbang status yang sama seperti create.
  const deliveryOrder = await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM delivery_orders WHERE id = ${id} FOR UPDATE`
    }
    const existing = await tx.deliveryOrder.findUniqueOrThrow({
      where: { id },
      select: { status: true, documentNo: true },
    })
    if (existing.status === "shipped" || existing.status === "delivered") {
      throw new Error(
        `Surat jalan ${existing.documentNo} berstatus "${existing.status}" tidak dapat diubah; hanya surat jalan konsep yang bisa diedit.`,
      )
    }

    const salesOrder = await tx.salesOrder.findUnique({
      where: { id: v.salesOrderId },
      select: { customerId: true, status: true, documentNo: true },
    })
    if (!salesOrder) {
      throw new Error("Pesanan Penjualan tidak ditemukan.")
    }
    if (salesOrder.status && !(DELIVERABLE_ORDER_STATUSES as readonly string[]).includes(salesOrder.status)) {
      throw new Error(
        `Surat jalan hanya bisa dibuat dari Pesanan Penjualan berstatus ${DELIVERABLE_ORDER_STATUS_LABELS}. ` +
          `Pesanan ${salesOrder.documentNo} masih berstatus "${salesOrder.status}".`,
      )
    }

    const slug = await nextSlug("deliveryOrder", existing.documentNo, { excludeId: id })

    // Fix #2: Jangan generate documentNo baru
    return tx.deliveryOrder.update({
      where: { id },
      data: {
        slug,
        doNumber: v.doNumber ?? null,
        customerId: salesOrder.customerId,
        salesOrderId: v.salesOrderId,
        date: wibDateToUtcMidnight(v.date),
        deliveryDate: v.deliveryDate ? wibDateToUtcMidnight(v.deliveryDate) : null,
        shippingAddress: v.shippingAddress ?? null,
        shippingProvince: v.shippingProvince ?? null,
        shippingCity: v.shippingCity ?? null,
        shippingDistrict: v.shippingDistrict ?? null,
        shippingVillage: v.shippingVillage ?? null,
        shippingPostalCode: v.shippingPostalCode ?? null,
        shippingPhone: v.shippingPhone ?? null,
        vehicleNumber: v.vehicleNumber ?? null,
        notes: v.notes ?? null,
      },
    })
  })

  await logActivity("update", "DeliveryOrder", deliveryOrder.id, `Memperbarui surat jalan #${deliveryOrder.id}`)
  revalidatePath("/penjualan/surat-jalan")
  return { success: true, id: deliveryOrder.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDeliveryOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function updateDownPayment(id: number, formData: FormData) {

  "use server"

  try {
  await requirePermission("edit_down_payments")

  // Fix #2: Jangan generate documentNo baru
  const proofImage: string | null | undefined = (await saveDownPaymentProof(formData)) ?? undefined

  const parsed = parseFormData(updateDownPaymentSchema, formData)
  if (!parsed.success) return { success: false, error: `Validasi gagal: ${parsed.error}` }
  const v = parsed.data

  const existingDp = await prisma.downPayment.findUniqueOrThrow({ where: { id } })
  if (existingDp.status !== "draft") {
    throw new Error("Hanya uang muka berstatus draf yang bisa diubah")
  }
  const slug = await nextSlug("downPayment", existingDp.documentNo, { excludeId: id })
  const quotationId = v.quotationId
  // Quotation TOCTOU guard: baca luar-tx dihapus. Quotation (status,
  // customerId, grandTotal) dibaca ulang DALAM tx setelah FOR UPDATE —
  // pesaing bisa mengubah/membatalkan quotation di antara baca luar dan tulis.

  const amount = v.amount

  // Lock the quotation row + re-run the cumulative cap + perform the write
  // INSIDE the same transaction so two concurrent updates (or a create racing
  // an update) on the same quotation can't each pass the cap (TOCTOU) and
  // together over-pay the quotation grandTotal. Mirrors the createDownPayment
  // lock pattern. The cap-check throw rolls the (otherwise no-op) tx back, and
  // the outer catch surfaces the same message.
  const dp = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM quotations WHERE id = ${quotationId} FOR UPDATE`

    const quotation = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId } })
    if (!["accepted", "approved", "converted"].includes(quotation.status)) {
      throw new Error("DP hanya bisa dibuat untuk quotation approved/accepted/converted")
    }

    const otherDPs = await tx.downPayment.aggregate({
      where: { quotationId, status: { not: "cancelled" }, id: { not: id } },
      _sum: { amount: true },
    })
    const totalOther = Number(otherDPs._sum.amount ?? 0)
    if (totalOther + amount > Number(quotation.grandTotal)) {
      throw new Error(`Total DP melebihi nilai quotation (sisa: ${Number(quotation.grandTotal) - totalOther})`)
    }

    const data: any = {
      slug,
      quotationId,
      customerId: quotation.customerId,
      amount,
      paymentDate: wibDateToUtcMidnight(v.paymentDate),
      paymentMethod: v.paymentMethod ?? null,
      notes: v.notes ?? null,
    }

    // Only update proofImage if new file uploaded
    if (proofImage !== undefined) {
      data.proofImage = proofImage
    }

    return tx.downPayment.update({
      where: { id },
      data,
    })
  })

  await logActivity("update", "DownPayment", dp.id, `Memperbarui uang muka #${dp.id}`)
  revalidatePath("/penjualan/uang-muka")
  return { success: true, id: dp.id }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[updateDownPayment]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
export async function deleteSalesOrder(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_orders")
  await prisma.salesOrder.findUniqueOrThrow({ where: { id } })
  await prisma.$transaction(async (tx) => {
    // P3 vonis F-2026-10-28-121-V: cascade menolak bila ada faktur turunan hidup
    // (non-draft/non-cancelled) — dilarang hapus diam-diam, arahkan void dulu.
    const liveInvoices = await tx.salesInvoice.findMany({
      where: { salesOrderId: id, status: { notIn: ["draft", "cancelled"] } },
      select: { id: true },
    })
    if (liveInvoices.length > 0) {
      throw new Error("Pesanan tidak bisa dihapus: masih ada faktur turunan yang hidup. Batalkan (void) faktur dulu.")
    }
    const invoices = await tx.salesInvoice.findMany({ where: { salesOrderId: id }, select: { id: true } })
    const invoiceIds = invoices.map((inv) => inv.id)
    // Reverse GL + stock for each linked invoice before cascading the delete.
    await Promise.all(invoiceIds.map((invId) => reverseSalesInvoicePostingTx(tx, invId)))
    if (invoiceIds.length) await tx.salesPayment.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: { in: invoiceIds } } })
    if (invoiceIds.length) await tx.salesInvoice.deleteMany({ where: { id: { in: invoiceIds } } })
    await tx.deliveryOrder.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } })
    await tx.salesOrder.delete({ where: { id } })
  })
  await logActivity("delete", "SalesOrder", id, `Menghapus pesanan penjualan #${id}`)
  revalidatePath("/penjualan/pesanan")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesOrder]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesInvoice(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_invoices")
  // P3 vonis F-2026-10-28-121-V: hapus fisik posted DILARANG — draft-only,
  // posted diarahkan ke void beralasan (pola deleteDownPayment draft-only).
  const existing = await prisma.salesInvoice.findUniqueOrThrow({ where: { id }, select: { id: true, status: true } })
  if (existing.status !== "draft") {
    return {
      success: false,
      error: "Hanya faktur draf yang bisa dihapus. Faktur posted dibatalkan lewat void beralasan.",
    }
  }
  let removedFiles: { fileUrl: string; referenceType: string }[] = [];
  await prisma.$transaction(async (tx) => {
    await reverseSalesInvoicePostingTx(tx, id)
    removedFiles = await deleteTransactionAttachmentsTx(tx, { referenceType: "sales_invoice", referenceId: id })
    await tx.salesPayment.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: id } })
    await tx.salesInvoice.delete({ where: { id } })
  })
  await removeAttachmentFiles(removedFiles)
  await logActivity("delete", "SalesInvoice", id, `Menghapus faktur penjualan #${id}`)
  revalidatePath("/penjualan/faktur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

/**
 * Void (cancel) a posted sales invoice while keeping the record for audit.
 * Reverses the revenue + COGS journals and restores stock (via
 * reverseSalesInvoicePostingTx), then marks the invoice "cancelled". Payments
 * must be removed first so cash/AR stay consistent.
 */
export async function voidSalesInvoice(id: number) {
  "use server"

  try {
  await requirePermission("delete_sales_invoices")
  await prisma.$transaction(async (tx) => {
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM sales_invoices WHERE id = ${id} FOR UPDATE`
    }
    const invoice = await tx.salesInvoice.findUniqueOrThrow({
      where: { id },
      include: { payments: { select: { id: true } } },
    })
    if (invoice.status === "draft") {
      throw new Error("Faktur draft tidak perlu dibatalkan. Gunakan hapus.")
    }
    if (invoice.status === "cancelled") {
      throw new Error("Faktur sudah dibatalkan.")
    }
    if (invoice.payments.length > 0) {
      throw new Error("Hapus pembayaran faktur ini terlebih dahulu sebelum membatalkan.")
    }

    await reverseSalesInvoicePostingTx(tx, id)
    await tx.salesInvoice.update({
      where: { id },
      data: { status: "cancelled", paymentStatus: "cancelled", paidAmount: 0 },
    })
  })

  await logActivity("void", "SalesInvoice", id, `Membatalkan faktur penjualan #${id}`)
  revalidatePath("/penjualan/faktur")
  revalidatePath(`/penjualan/faktur/${id}`)
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[voidSalesInvoice]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}

export async function deleteSalesReturn(id: number) {
  "use server"

  try {
  // Fix #23: Add permission check
  await requirePermission("delete_sales_returns")
  const sr = await prisma.salesReturn.findUniqueOrThrow({ where: { id } })
  if (sr.status === "completed") {
    throw new Error("Tidak bisa menghapus retur yang sudah completed")
  }
  await prisma.salesReturn.delete({ where: { id } })
  await logActivity("delete", "SalesReturn", id, `Menghapus retur penjualan #${id}`)
  revalidatePath("/penjualan/retur")
  return { success: true }

  } catch (e: unknown) {
    if (isNextRedirectError(e)) throw e
    console.error("[deleteSalesReturn]", getErrorMessage(e) || e)
    return { success: false, error: getErrorMessage(e, "Terjadi kesalahan") }
  }
}
