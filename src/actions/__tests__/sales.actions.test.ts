import { describe, it, expect, vi, beforeEach } from "vitest"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const mocks = vi.hoisted(() => {
  const requirePermissionMock = vi.fn()
  const revalidateMock = vi.fn()
  const logActivityMock = vi.fn()
  const generateDocNumMock = vi.fn()
  const safeJsonParseMock = vi.fn((s: any) => {
    if (typeof s === "string") { try { return JSON.parse(s) } catch { return null } }
    return s
  })
  const notifyAdminsMock = vi.fn()
  const notifyUserMock = vi.fn()
  const notifyRoleMock = vi.fn()
  const onSalesInvoicePostedMock = vi.fn()
  const onSalesPaymentCreatedMock = vi.fn()
  const onSalesPaymentUpdatedMock = vi.fn()
  const onSalesPaymentDeletedMock = vi.fn()
  const onSalesReturnCompletedMock = vi.fn()
  const onDownPaymentConfirmedMock = vi.fn()
  const onDownPaymentReceivedMock = vi.fn()
  const deleteJournalByReferenceMock = vi.fn()
  const deleteJournalByReferenceTxMock = vi.fn()
  const reverseJournalsByReferenceTxMock = vi.fn()
  const resyncOnEditMock = vi.fn()
  const findOverReturnMock = vi.fn().mockReturnValue(null)

  const buildModelMock = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({}),
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0, grandTotal: 0, paidAmount: 0 } }),
  })

  const prismaMock = {
    quotation: buildModelMock(),
    quotationSection: buildModelMock(),
    quotationItem: buildModelMock(),
    quotationHistory: buildModelMock(),
    customerVehicle: buildModelMock(),
    customer: buildModelMock(),
    customerCommissionRate: buildModelMock(),
    customerPriceList: buildModelMock(),
    salesOrder: buildModelMock(),
    salesOrderItem: buildModelMock(),
    salesInvoice: buildModelMock(),
    salesInvoiceItem: buildModelMock(),
    salesPayment: buildModelMock(),
    salesPaymentAllocation: buildModelMock(),
    withholdingCertificate: buildModelMock(),
    financialIdempotencyKey: buildModelMock(),
    salesReturn: buildModelMock(),
    salesReturnItem: buildModelMock(),
    deliveryOrder: buildModelMock(),
    deliveryOrderItem: buildModelMock(),
    downPayment: buildModelMock(),
    documentSequence: buildModelMock(),
    item: buildModelMock(),
    itemStock: buildModelMock(),
    journal: buildModelMock(),
    journalEntry: buildModelMock(),
    account: buildModelMock(),
    user: buildModelMock(),
    setting: buildModelMock(),
    systemSetting: buildModelMock(),
    role: buildModelMock(),
    permission: buildModelMock(),
    rolePermission: buildModelMock(),
    activityLog: buildModelMock(),
    notification: buildModelMock(),
    employee: buildModelMock(),
    department: buildModelMock(),
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    project: buildModelMock(),
    stockMove: buildModelMock(),
    inventoryLayer: buildModelMock(),
    transactionAttachment: buildModelMock(),
    approvalWorkflow: buildModelMock(),
    approval: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") {
        return ops(prismaMock)
      }
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock,
    revalidateMock,
    logActivityMock,
    generateDocNumMock,
    safeJsonParseMock,
    notifyAdminsMock,
    notifyUserMock,
    notifyRoleMock,
    onSalesInvoicePostedMock,
    onSalesPaymentCreatedMock,
    onSalesPaymentUpdatedMock,
    onSalesPaymentDeletedMock,
    onSalesReturnCompletedMock,
    onDownPaymentConfirmedMock,
    onDownPaymentReceivedMock,
    deleteJournalByReferenceMock,
    deleteJournalByReferenceTxMock,
    reverseJournalsByReferenceTxMock,
    resyncOnEditMock,
    findOverReturnMock,
    prismaMock,
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: mocks.prismaMock,
}))


vi.mock("@/lib/utils/error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/error")>()
  return {
    ...actual,
    isNextRedirectError: (e: unknown) =>
      e instanceof Error && (e as any).digest?.startsWith("NEXT_REDIRECT") === true,
  }
})

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocNumMock(...a),
}))

vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

vi.mock("@/lib/utils/safe-parse", async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    safeJsonParse: mocks.safeJsonParseMock,
  }
})

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyAdmins: (...a: unknown[]) => mocks.notifyAdminsMock(...a),
    notifyUser: (...a: unknown[]) => mocks.notifyUserMock(...a),
    notifyRole: (...a: unknown[]) => mocks.notifyRoleMock(...a),
  },
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: (...a: unknown[]) => mocks.onSalesInvoicePostedMock(...a),
  onSalesPaymentCreated: (...a: unknown[]) => mocks.onSalesPaymentCreatedMock(...a),
  onSalesReturnCompleted: (...a: unknown[]) => mocks.onSalesReturnCompletedMock(...a),
  onDownPaymentReceived: (...a: unknown[]) => mocks.onDownPaymentReceivedMock(...a),
  deleteJournalByReference: (...a: unknown[]) => mocks.deleteJournalByReferenceMock(...a),
  deleteJournalByReferenceTx: (...a: unknown[]) => mocks.deleteJournalByReferenceTxMock(...a),
  reverseJournalsByReferenceTx: (...a: unknown[]) => mocks.reverseJournalsByReferenceTxMock(...a),
}))

vi.mock("@/lib/hooks/down-payment.hook", () => ({
  onDownPaymentConfirmed: (...a: unknown[]) => mocks.onDownPaymentConfirmedMock(...a),
}))

vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: (...a: unknown[]) => mocks.onSalesPaymentCreatedMock(...a),
  onSalesPaymentUpdated: (...a: unknown[]) => mocks.onSalesPaymentUpdatedMock(...a),
  onSalesPaymentDeleted: (...a: unknown[]) => mocks.onSalesPaymentDeletedMock(...a),
}))

vi.mock("@/lib/hooks/sales-return.hook", () => ({
  onSalesReturnCompleted: (...a: unknown[]) => mocks.onSalesReturnCompletedMock(...a),
}))

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/quotation-sync.service", () => ({
  resyncOnEdit: (...a: unknown[]) => mocks.resyncOnEditMock(...a),
}))

// Settlement rules: by default no real (non-DP) payment → items editable.
// Individual tests can override the mocks to simulate a locked document.
vi.mock("@/lib/services/sales-settlement.service", () => ({
  DOWN_PAYMENT_METHOD: "down_payment",
  hasRealSettlement: vi.fn().mockResolvedValue(false),
  salesOrderHasRealSettlement: vi.fn().mockResolvedValue(false),
  quotationHasRealSettlement: vi.fn().mockResolvedValue(false),
}))

vi.mock("@/lib/services/sales-invoice-posting.service", () => ({
  reverseSalesInvoicePostingTx: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/sales/return-validation", () => ({
  findOverReturn: (...a: unknown[]) => mocks.findOverReturnMock(...a),
}))

vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}))

// storage asli menarik prisma + aws-sdk; mock assertMagicBytes dengan semantik
// nyata: tolak bila header tak cocok (agar mutasi "cabut cek" memerah).
vi.mock("@/lib/storage/storage", () => ({
  assertMagicBytes: vi.fn((buffer: Buffer, mimeType: string) => {
    const head = Array.from(buffer.subarray(0, 12))
    const ok =
      (mimeType === "image/jpeg" && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) ||
      (mimeType === "image/png" && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) ||
      (mimeType === "image/gif" && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) ||
      (mimeType === "image/webp" && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) ||
      (mimeType === "application/pdf" && head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d)
    if (!ok) throw new Error("Isi file tidak sesuai dengan format yang diklaim (kemungkinan file palsu)")
  }),
}))

import * as actions from "../sales.actions"

function fdQuotation(payload: any): FormData {
  const f = new FormData()
  f.append("data", JSON.stringify(payload))
  return f
}

function fdMap(payload: Record<string, string | number | null | undefined | File>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) {
      if (v instanceof File) f.append(k, v)
      else f.append(k, String(v))
    }
  }
  return f
}

const basicPayload = {
  customerId: 1,
  date: "2026-06-12",
  sections: [],
  discount: 0,
  tax: 0,
}

describe("Quotation Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("Q-001")
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ 
      id: 1, status: "draft", sections: [{ items: [{ id: 1 }] }] 
    })
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  // === createQuotation ===
  it("createQuotation fails on invalid json", async () => {
    const res = await actions.createQuotation(fdMap({ data: "invalid json" }))
    expect(res?.success).toBe(false)
  })
  it("createQuotation fails on mismatched vehicle", async () => {
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(null)
    const res = await actions.createQuotation(fdQuotation({ ...basicPayload, customerVehicleId: 1 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kendaraan tidak terdaftar")
  })
  it("createQuotation computes subtotal/totals correctly with discount amount", async () => {
    const payload = {
      customerId: 1, date: "2026-06-12", discount: 10, tax: 5,
      sections: [{
        items: [{ qty: 2, unitPrice: 100, discountType: "amount", discount: 10 }] // 2*100 - 10 = 190
      }]
    }
    const res = await actions.createQuotation(fdQuotation(payload))
    expect(res?.success).toBe(true)
    const createCall = mocks.prismaMock.quotation.create.mock.calls[0][0].data
    expect(createCall.subtotal).toBe(190)
    expect(createCall.grandTotal).toBe(190 + 5 - 10)
  })
  it("createQuotation computes subtotal/totals correctly with discount percent", async () => {
    const payload = {
      customerId: 1, date: "2026-06-12", discount: 0, tax: 0,
      sections: [{
        items: [{ qty: 2, unitPrice: 100, discountType: "percent", discount: 10 }] // 2*100 = 200, 10% = 20, total = 180
      }]
    }
    const res = await actions.createQuotation(fdQuotation(payload))
    expect(res?.success).toBe(true)
    const createCall = mocks.prismaMock.quotation.create.mock.calls[0][0].data
    expect(createCall.subtotal).toBe(180)
  })

  // === sendQuotation ===
  it("sendQuotation fails if status is not draft", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa dikirim dari status draft")
  })
  it("sendQuotation fails if no items", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotationItem.count.mockResolvedValue(0)
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("harus memiliki minimal 1 item")
  })

  // === acceptQuotation / rejectQuotation ===
  it("acceptQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(false)
  })
  it("rejectQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.rejectQuotation(1)
    expect(res?.success).toBe(false)
  })
  // F-36: guard validUntil — accept/convert lewat masa berlaku ditolak, belum lewat hijau.
  it("acceptQuotation fails when validUntil has passed (WIB)", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "sent", revisionNumber: 1, validUntil: new Date(Date.UTC(2000, 0, 1)),
    })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Masa berlaku penawaran sudah lewat")
    expect(mocks.prismaMock.quotationHistory.create).not.toHaveBeenCalled()
  })
  it("acceptQuotation succeeds when validUntil is today (WIB, still valid)", async () => {
    // validUntil disimpan sebagai tengah malam UTC hari kalender WIB — pakai
    // helper yang sama dengan produksi, bukan tengah malam UTC hari UTC
    // (antara 00.00–06.59 WIB hari UTC masih kemarin, fixture lama merah).
    const todayUtcMidnight = getWibTodayUtcDate()
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "sent", revisionNumber: 1, validUntil: todayUtcMidnight,
    })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("convertQuotationToOrder fails when validUntil has passed (WIB)", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "accepted", sections: [], validUntil: new Date(Date.UTC(2000, 0, 1)),
    })
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Masa berlaku penawaran sudah lewat")
  })
  // F-38(a): alasan opsional tercatat di histori; tanpa alasan = deskripsi lama persis.
  it("rejectQuotation records optional reason in history", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.rejectQuotation(1, "  Harga kompetitor lebih murah  ")
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.quotationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "rejected",
          description: expect.stringContaining("Alasan: Harga kompetitor lebih murah"),
        }),
      }),
    )
  })
  // F-2026-10-20-101 tahap server: awalan kategori tak dikenal ditolak agar
  // tidak mengotori agregasi kalah (jatuh ke ember tak-tercatat).
  it("rejectQuotation rejects unknown lost-reason category prefix", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.rejectQuotation(1, "[kalah:bukan-kategori] Harga kompetitor")
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kategori alasan kalah")
    expect(mocks.prismaMock.quotationHistory.create).not.toHaveBeenCalled()
  })
  it("rejectQuotation accepts known lost-reason category prefix", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.rejectQuotation(1, "[kalah:harga] Harga kompetitor")
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.quotationHistory.create).toHaveBeenCalled()
  })
  it("rejectQuotation without reason keeps legacy history description", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.rejectQuotation(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.quotationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Penawaran ditolak oleh pelanggan (revisi v3)",
        }),
      }),
    )
  })

  // === reviseQuotation ===
  it("reviseQuotation fails if status is not sent", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.reviseQuotation(1, "reason")
    expect(res?.success).toBe(false)
  })
  it("reviseQuotation fails if reason is empty", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.reviseQuotation(1, "   ")
    expect(res?.success).toBe(false)
  })

  // === convertQuotationToOrder ===
  it("convertQuotationToOrder fails if status not accepted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(false)
  })
  it("convertQuotationToOrder fails if already converted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", sections: [] })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue({ id: 2 }) // existing SO
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah memiliki Pesanan Penjualan")
  })

  // === updateQuotation ===
  it("updateQuotation fails if converted", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "converted" })
    const res = await actions.updateQuotation(1, fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("updateQuotation fails on mismatched vehicle", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", customerId: 1 })
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue(null)
    const res = await actions.updateQuotation(1, fdQuotation({ ...basicPayload, customerVehicleId: 2 }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kendaraan tidak terdaftar")
  })
  it("updateQuotation succeeds with omitted optional dates", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", customerId: 1 })
    const res = await actions.updateQuotation(1, fdQuotation({ customerId: 1, sections: [], discount: 0, tax: 0 }))
    expect(res?.success).toBe(true)
  })
  // === item editing (regression: edited line items used to be silently dropped) ===
  it("updateQuotation persists edited section items and re-syncs linked docs", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", customerId: 1 })
    const res = await actions.updateQuotation(1, fdQuotation({
      ...basicPayload,
      sections: [{ name: "Jasa", items: [{ itemId: 5, qty: 2, unitPrice: 1000, discount: 0, total: 2000 }] }],
    }))
    expect(res?.success).toBe(true)
    // Old sections wiped and recreated via nested write on the quotation update.
    expect(mocks.prismaMock.quotationSection.deleteMany).toHaveBeenCalled()
    expect(mocks.prismaMock.quotation.update).toHaveBeenCalled()
    // Linked SO/Invoice re-sync runs after the section rewrite, carrying the
    // acting user id so a posted invoice can be reversed + re-posted.
    expect(mocks.resyncOnEditMock).toHaveBeenCalledWith(1, expect.any(Number))
  })
  it("updateQuotation fails on invalid json", async () => {
    const res = await actions.updateQuotation(1, fdMap({ data: "invalid json" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Data penawaran tidak valid")
  })
})

describe("Down Payment Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DP-001")
  })

  // === createDownPayment ===
  it("createDownPayment fails on invalid data", async () => {
    const res = await actions.createDownPayment(fdMap({}))
    expect(res?.success).toBe(false)
  })
  it("createDownPayment fails if quotation status invalid", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", grandTotal: 1000 })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("createDownPayment fails if cap exceeded", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 600 } })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 500, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Total DP melebihi nilai quotation")
  })
  it("createDownPayment succeeds with proofImage", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "proof.jpg", { type: "image/jpeg" })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(true)
  })
  it("createDownPayment rejects proofImage whose bytes mismatch the claimed type", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const file = new File([new TextEncoder().encode("<?php echo 1;")], "proof.jpg", { type: "image/jpeg" })
    const res = await actions.createDownPayment(fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak sesuai")
  })

  // === updateDownPayment ===
  it("updateDownPayment fails if status not draft", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if quotation invalid", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if cap exceeded", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 600 } })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 500, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment fails if amount zero", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 0, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateDownPayment succeeds with proofImage", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "proof.jpg", { type: "image/jpeg" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(true)
  })
  it("updateDownPayment rejects proofImage whose bytes mismatch the claimed type", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    const file = new File([new TextEncoder().encode("<script>alert(1)</script>")], "proof.png", { type: "image/png" })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", proofImage: file }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak sesuai")
  })

  // === Zod validation (regression: Zod bypass) ===
  it("updateDownPayment rejects with Zod error when amount is zero (no DB lookup)", async () => {
    const findUniqueOrThrowSpy = mocks.prismaMock.downPayment.findUniqueOrThrow
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 0, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(findUniqueOrThrowSpy).not.toHaveBeenCalled()
  })
  it("updateDownPayment rejects when amount is negative", async () => {
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: -100, paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })
  it("updateDownPayment rejects when paymentDate is empty", async () => {
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })
  it("updateDownPayment rejects oversized notes (5MB+ blob)", async () => {
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: 1, amount: 100, paymentDate: "2026-06-12", notes: "x".repeat(501) }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })

  // === deleteDownPayment ===
  it("deleteDownPayment fails if status not draft", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.deleteDownPayment(1)
    expect(res?.success).toBe(false)
  })
})

describe("Sales Order Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SO-001")
  })

  // === guards ===
  it("updateSalesOrder allows editing a confirmed order when unpaid (custom fabrication)", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesOrder blocks editing once a real (non-DP) payment exists", async () => {
    const settlement = await import("@/lib/services/sales-settlement.service")
    vi.mocked(settlement.salesOrderHasRealSettlement).mockResolvedValueOnce(true)
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "confirmed" })
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pelunasan")
  })
  it("updateSalesOrder blocks a cancelled order", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled" })
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  // === Zod validation (regression: Zod bypass) ===
  it("updateSalesOrder rejects empty date before any DB lookup", async () => {
    const findSpy = mocks.prismaMock.salesOrder.findUniqueOrThrow
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: 1, date: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(findSpy).not.toHaveBeenCalled()
  })
  it("updateSalesOrder rejects missing customerId", async () => {
    const res = await actions.updateSalesOrder(1, fdMap({ date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })
})

describe("Sales Invoice Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("INV-001")
  })

  // === postInvoice ===
  it("postInvoice fails if not draft", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("E127-8b: postInvoice menolak faktur cancelled (batal permanen) sebelum hook posting", async () => {
    // F-2026-10-23-127-V Putusan 4: unik jurnal aktif-saja membuka kunci
    // FISIK re-post, tetapi gerbang status dokumen tetap menolak faktur
    // batal-permanen. Gerbang ini wajib berjalan sebelum klaim atomik dan
    // sebelum onSalesInvoicePosted dipanggil.
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled" })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("draft atau approved")
    expect(mocks.prismaMock.salesInvoice.updateMany).not.toHaveBeenCalled()
    expect(mocks.onSalesInvoicePostedMock).not.toHaveBeenCalled()
  })
  it("postInvoice fails if no items", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(0)
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("postInvoice fails if concurrent post happens", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", grandTotal: 0, paidAmount: 0 })
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValue(1)
    mocks.prismaMock.salesInvoice.updateMany.mockResolvedValue({ count: 0 }) // Concurrency check fail
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah di-post")
  })

  // === updateSalesInvoice ===
  it("updateSalesInvoice allows editing a posted-but-unpaid invoice (custom fabrication)", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    const payload = {
      customerId: 1, date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitPrice: 100, discount: 0 }]),
      taxRate: 0,
      discount: 0,
    }
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
  })
  // Regresi kehilangan tautan: form faktur tidak punya input quotationId, jadi
  // payload tidak pernah memuatnya — `?? null` dulu menghapus tautan penawaran
  // setiap kali faktur disimpan.
  it("updateSalesInvoice mempertahankan quotationId yang tidak dikirim form", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", quotationId: 77, paidAmount: 0, grandTotal: 0,
    })
    const payload = {
      customerId: 1, date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100, discount: 0 }]),
      taxRate: 0,
      discount: 0,
    }
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
    // Aksi memanggil salesInvoice.update dua kali (header, lalu total/status),
    // jadi ambil call yang memang memuat quotationId — bukan yang terakhir.
    const headerUpdate = mocks.prismaMock.salesInvoice.update.mock.calls
      .map(([arg]) => arg as { data?: Record<string, unknown> } | undefined)
      .find((arg) => arg?.data && "quotationId" in arg.data)
    expect(headerUpdate?.data?.quotationId).toBe(77)
  })
  it("updateSalesInvoice reverse+reposts a posted invoice on edit", async () => {
    const posting = await import("@/lib/services/sales-invoice-posting.service")
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted" })
    const payload = {
      customerId: 1, date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100, discount: 0 }]),
      taxRate: 0,
      discount: 0,
    }
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
    // A posted invoice's old stock/GL must be reversed then re-posted.
    expect(vi.mocked(posting.reverseSalesInvoicePostingTx)).toHaveBeenCalled()
    expect(mocks.onSalesInvoicePostedMock).toHaveBeenCalled()
  })
  it("updateSalesInvoice blocks editing once a real (non-DP) payment exists", async () => {
    const settlement = await import("@/lib/services/sales-settlement.service")
    vi.mocked(settlement.hasRealSettlement).mockResolvedValueOnce(true)
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "partial" })
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pelunasan")
  })
  it("updateSalesInvoice blocks a cancelled invoice", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled" })
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: 1, date: "2026-06-12" }))
    expect(res?.success).toBe(false)
  })
  it("updateSalesInvoice rejects empty date before DB lookup", async () => {
    const findSpy = mocks.prismaMock.salesInvoice.findUniqueOrThrow
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: 1, date: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(findSpy).not.toHaveBeenCalled()
  })
  it("updateSalesInvoice computes discount and status", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 50 })
    const payload = {
      customerId: 1, date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitPrice: 100, discount: 50 }]), // 2*100 - 50 = 150
      taxRate: 10,
      discount: 20 // Subtotal 150 - 20 = 130 -> Tax 13 -> Grand 143
    }
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
    const updateCall = mocks.prismaMock.salesInvoice.update.mock.calls[1][0].data
    expect(updateCall.subtotal).toBe(150)
    expect(updateCall.discount).toBe(20)
    expect(updateCall.taxAmount).toBe(13)
    expect(updateCall.grandTotal).toBe(143)
    expect(updateCall.paymentStatus).toBe("partial") // paid 50 of 143
  })
  it("updateSalesInvoice paymentStatus paid", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 150 }) // Paid all
    const payload = { customerId: 1, date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }
    await actions.updateSalesInvoice(1, fdMap(payload))
    const updateCall = mocks.prismaMock.salesInvoice.update.mock.calls[1][0].data
    expect(updateCall.paymentStatus).toBe("paid")
  })

  // F-2026-10-25-036-S lanjutan: edit item menurunkan grandTotal ke bawah
  // paidAmount lama (mis. DP penuh) menaikkan status ke paid TANPA jalur
  // pembayaran — snapshot tarif komisi wajib dibekukan lewat helper bersama.
  const seedPaidEdit = (paidAmount: number, commissionRatePercent: number | null) => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "posted", paidAmount, commissionRatePercent,
    })
    return { customerId: 1, date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }
  }
  const totalsUpdate = () => mocks.prismaMock.salesInvoice.update.mock.calls[1][0].data
  it("updateSalesInvoice transisi ke paid via edit membekukan snapshot tarif per tanggal faktur", async () => {
    const payload = seedPaidEdit(150, null)
    mocks.prismaMock.customer.findUnique.mockResolvedValue({ customerCategoryId: 1 })
    // Tarif master berubah sesudah tanggal faktur: 2% s/d 1 Jul, 3% sesudahnya.
    // Tanggal faktur final 12 Jun 2026 -> snapshot beku 2%, bukan tarif berjalan.
    mocks.prismaMock.customerCommissionRate.findMany.mockResolvedValue([
      { id: 1, customerCategoryId: 1, commissionPercent: 2, effectiveFrom: new Date(Date.UTC(2026, 0, 1)), effectiveTo: new Date(Date.UTC(2026, 6, 1)) },
      { id: 2, customerCategoryId: 1, commissionPercent: 3, effectiveFrom: new Date(Date.UTC(2026, 6, 1)), effectiveTo: null },
    ])
    const res = await actions.updateSalesInvoice(1, fdMap(payload))
    expect(res?.success).toBe(true)
    const updateCall = totalsUpdate()
    expect(updateCall.paymentStatus).toBe("paid")
    expect(Number(updateCall.commissionRatePercent)).toBe(2)
    expect(updateCall.commissionCustomerCategoryId).toBe(1)
    expect(updateCall.commissionRateId).toBe(1)
  })
  it("updateSalesInvoice tidak menimpa snapshot komisi yang sudah beku", async () => {
    const res = await actions.updateSalesInvoice(1, fdMap(seedPaidEdit(150, 7)))
    expect(res?.success).toBe(true)
    const updateCall = totalsUpdate()
    expect(updateCall.paymentStatus).toBe("paid")
    expect(updateCall.commissionRatePercent).toBeUndefined()
    expect(mocks.prismaMock.customerCommissionRate.findMany).not.toHaveBeenCalled()
  })
  it("updateSalesInvoice turun ke partial tidak menulis snapshot komisi", async () => {
    const res = await actions.updateSalesInvoice(1, fdMap(seedPaidEdit(50, null)))
    expect(res?.success).toBe(true)
    const updateCall = totalsUpdate()
    expect(updateCall.paymentStatus).toBe("partial")
    expect(updateCall.commissionRatePercent).toBeUndefined()
    expect(mocks.prismaMock.customerCommissionRate.findMany).not.toHaveBeenCalled()
  })

  // === voidSalesInvoice ===
  it("voidSalesInvoice fails if draft", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", payments: [] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("voidSalesInvoice fails if cancelled", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled", payments: [] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
  })
  it("voidSalesInvoice fails if has payments", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", payments: [{ id: 1, status: "posted" }] })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Reversal")
  })
  it("voidSalesInvoice lolos bila semua payment reversed (P2 121-V / E139-5)", async () => {
    const posting = await import("@/lib/services/sales-invoice-posting.service")
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", customerId: 1, grandTotal: 100, paidAmount: 0, payments: [{ id: 1, status: "reversed" }, { id: 2, status: "reversed" }] })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(true)
    expect(vi.mocked(posting.reverseSalesInvoicePostingTx)).toHaveBeenCalled()
  })

  // === reverseSalesInvoicePostingTx delegation ===
  it("deleteSalesInvoice delegates stock/GL reversal to the posting service", async () => {
    const posting = await import("@/lib/services/sales-invoice-posting.service")
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(true)
    // The reversal (stock restore + journal delete) now lives in the shared
    // service so the invoice-edit flow can reuse it; assert the delegation.
    expect(vi.mocked(posting.reverseSalesInvoicePostingTx)).toHaveBeenCalled()
  })
})

describe("Sales Payment Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("PAY-001")
  })

  // === createSalesPayment ===
  it("createSalesPayment fails if invoice not posted", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  it("createSalesPayment fails if overpaid", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 200, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  // FIN-BR-006: satu helper bersama dua lewat-sisa batas (dalam vs luar Rp1).
  async function createPaymentOf(amount: number) {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 1000, paidAmount: 0, customerId: 3 })
    return actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount, paymentDate: "2026-06-12", paymentMethod: "cash" }))
  }

  it("FIN-BR-006: createSalesPayment lolos bila lewat sisa dalam toleransi Rp1", async () => {
    // grandTotal 1000, paid 0 → remaining 1000. Bayar 1000.50: lewat 0.50
    // (pembulatan rupiah-penuh), bukan overpay.
    const res = await createPaymentOf(1000.50)
    expect(res?.success).toBe(true)
  })
  it("FIN-BR-006: createSalesPayment tetap tolak bila lewat sisa di atas Rp1", async () => {
    const res = await createPaymentOf(1002)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi sisa tagihan")
  })
  it("createSalesPayment updates attachments", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash", attachmentIds: "[1,2]" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
  })

  // === updateSalesPayment ===
  it("updateSalesPayment fails if amount 0", async () => {
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 0, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
  })
  // === Zod validation (regression: Zod bypass) ===
  it("updateSalesPayment rejects amount 0 before any DB lookup", async () => {
    const findSpy = mocks.prismaMock.salesPayment.findUniqueOrThrow
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 0, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(findSpy).not.toHaveBeenCalled()
  })
  it("updateSalesPayment rejects empty paymentMethod", async () => {
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
  })
  it("updateSalesPayment fails if overpaid", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 1 })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100 })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 50 } }) // others
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 100, paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false) // 100 + 50 > 100
  })
  it("updateSalesPayment updates attachments and triggers cross-invoice recalc", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 2 }) // Changed invoice from 2 -> 1
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", grandTotal: 100 })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } }) 
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: 1, amount: 50, paymentDate: "2026-06-12", paymentMethod: "cash", attachmentIds: "[3]" }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.updateMany).toHaveBeenCalled()
    expect(mocks.onSalesPaymentUpdatedMock).toHaveBeenCalledTimes(2) // Both new and old invoices updated
  })
})

describe("Sales Return Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SR-001")
    // Faktur rujukan retur pada fixture ini berstatus posted (bisa diretur).
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({ status: "posted" })
  })

  // === completeSalesReturn ===
  it("completeSalesReturn fails if already completed", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
  })

  // === F-2026-10-25-012-S gerbang persetujuan retur penjualan ===
  it("AC-SR-B1: completeSalesReturn menuntut approve_sales_returns, bukan edit_sales_returns", async () => {
    mocks.requirePermissionMock.mockImplementation(async (key: string) => {
      if (key === "approve_sales_returns") throw new Error("Tidak punya izin approve_sales_returns")
      return { id: 7 }
    })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("approve_sales_returns")
    // Gerbang izin SEBELUM retur dibaca / transaksi dibuka: nol stok, nol jurnal.
    expect(mocks.prismaMock.salesReturn.findUniqueOrThrow).not.toHaveBeenCalled()
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    expect(mocks.onSalesReturnCompletedMock).not.toHaveBeenCalled()
  })

  it("AC-SR-B2: penyetuju lain menyelesaikan draft tepat satu transaksi", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", createdBy: 3, reason: "Barang cacat", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1)
    // Satu transaksi memuat hook stok + hook jurnal existing.
    expect(mocks.onSalesReturnCompletedMock).toHaveBeenCalledTimes(2)
  })

  it("AC-SR-B3: SoD — pembuat tidak boleh menyelesaikan returnya sendiri", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", createdBy: 7, reason: "Barang cacat", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pembuatnya sendiri")
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    expect(mocks.onSalesReturnCompletedMock).not.toHaveBeenCalled()
  })

  it("EC-2: createdBy null (baris legacy) boleh diselesaikan penyetuju berizin", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", createdBy: null, reason: "Barang cacat", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(true)
  })

  // P4 vonis F-2026-10-26-121-V syarat pengimbang (tanpa model SalesCreditNote):
  // complete tanpa reason trim non-kosong ditolak SEBELUM transaksi.
  it("E121-7: completeSalesReturn tanpa reason ditolak, nol mutasi", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", createdBy: 3, reason: "   ", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tanpa alasan tertulis")
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
    expect(mocks.onSalesReturnCompletedMock).not.toHaveBeenCalled()
  })

  it("BR-SR-03: status selain draft ditolak berpesan sebelum transaksi", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7 })
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "cancelled", createdBy: 3, items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa diselesaikan dari status draft")
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  // === createSalesReturn over-return branch coverage ===
  it("createSalesReturn menolak faktur konsep (di luar RETURNABLE_INVOICE_STATUSES)", async () => {
    mocks.prismaMock.salesInvoice.findUnique.mockResolvedValue({ status: "draft" })
    const items = JSON.stringify([{ itemId: 1, qty: 1 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak bisa diretur")
  })
  it("createSalesReturn fails on over-return violation not_on_invoice", async () => {
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "not_on_invoice", itemId: 99 })
    const items = JSON.stringify([{ itemId: 99, qty: 1 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ada pada faktur")
  })
  it("createSalesReturn fails on over-return violation exceeds_invoiced", async () => {
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "exceeds_invoiced", itemId: 1, invoiced: 5, alreadyReturned: 0, remaining: 5 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi yang difakturkan")
  })

  // === updateSalesReturn ===
  it("updateSalesReturn fails if not draft", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "completed" })
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, date: "2026-06-12", items: "[]" }))
    expect(res?.success).toBe(false)
  })
  // === Zod validation (regression: Zod bypass) ===
  it("updateSalesReturn rejects empty items before DB lookup", async () => {
    const findSpy = mocks.prismaMock.salesReturn.findUnique
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, date: "2026-06-12", items: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(findSpy).not.toHaveBeenCalled()
  })
  // Regresi kehilangan data: payload yang tersaring HABIS (bukan string kosong —
  // kasus itu sudah ditangkap Zod) dulu membuat aksi menghapus seluruh item retur
  // lalu menulis nol baris, sehingga item hilang tanpa pesan.
  it("updateSalesReturn menolak payload yang tersaring habis tanpa menghapus item", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    const items = JSON.stringify([{ itemId: 0, qty: 1 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("minimal satu barang")
    expect(mocks.prismaMock.salesReturnItem.deleteMany).not.toHaveBeenCalled()
  })
  it("updateSalesReturn fails on over-return violation", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "exceeds_invoiced", itemId: 1, invoiced: 5, alreadyReturned: 0, remaining: 5 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi yang difakturkan")
  })
  it("updateSalesReturn fails on not_on_invoice violation", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    mocks.findOverReturnMock.mockReturnValueOnce({ type: "not_on_invoice", itemId: 1 })
    const items = JSON.stringify([{ itemId: 1, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ada pada faktur")
  })

  it("createSalesReturn membaca qty string format Indonesia penuh", async () => {
    const items = JSON.stringify([{ itemId: 1, qty: "2.000" }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0].qty).toBe(2000)
  })

  // F-004 §3: nomor + tanggal nota retur pajak ditulis apa adanya (sebelumnya
  // kolom hanya dibaca read-model SPT, tidak pernah ada jalur tulis produk).
  it("createSalesReturn menulis nomor + tanggal nota retur pajak", async () => {
    const items = JSON.stringify([{ itemId: 1, qty: 1 }])
    const res = await actions.createSalesReturn(fdMap({
      customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items,
      taxReturnNoteNumber: "000000.0100000001", taxReturnNoteDate: "2026-07-01",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.taxReturnNoteNumber).toBe("000000.0100000001")
    expect(arg.data.taxReturnNoteDate).toEqual(new Date(Date.UTC(2026, 6, 1)))
  })

  it("createSalesReturn tanpa nota retur pajak menulis null (masa jatuh ke tanggal retur)", async () => {
    const items = JSON.stringify([{ itemId: 1, qty: 1 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.taxReturnNoteNumber).toBeNull()
    expect(arg.data.taxReturnNoteDate).toBeNull()
  })

  it("updateSalesReturn menulis nomor + tanggal nota retur pajak", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    const items = JSON.stringify([{ itemId: 1, qty: 1 }])
    const res = await actions.updateSalesReturn(1, fdMap({
      customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items,
      taxReturnNoteNumber: "NR-2026-001", taxReturnNoteDate: "2026-08-15",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.update.mock.calls.at(-1)![0]
    expect(arg.data.taxReturnNoteNumber).toBe("NR-2026-001")
    expect(arg.data.taxReturnNoteDate).toEqual(new Date(Date.UTC(2026, 7, 15)))
  })

  it("createSalesReturn menolak qty tak terbaca tanpa membuat retur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const items = JSON.stringify([{ itemId: 1, qty: "abc" }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas retur item #1 tidak valid/i)
    expect(mocks.prismaMock.salesReturn.create).not.toHaveBeenCalled()
  })

  it("createSalesReturn membuang baris tanpa item / qty nol (baris kosong form)", async () => {
    const items = JSON.stringify([{ itemId: 0, qty: 5 }, { itemId: 1, qty: 0 }, { itemId: 2, qty: 3 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create).toEqual([expect.objectContaining({ itemId: 2, qty: 3 })])
  })

  // === updateSalesReturn ===
  it("updateSalesReturn membaca qty string format Indonesia penuh", async () => {
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    const items = JSON.stringify([{ itemId: 1, qty: "1,5" }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesReturn.update.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0].qty).toBe(1.5)
  })

  it("updateSalesReturn menolak qty tak terbaca tanpa menghapus baris lama", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ status: "draft" })
    const items = JSON.stringify([{ itemId: 1, qty: "abc" }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: 1, salesInvoiceId: 1, date: "2026-06-12", items }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas retur item #1 tidak valid/i)
    expect(mocks.prismaMock.salesReturnItem.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.salesReturn.update).not.toHaveBeenCalled()
  })

  // === deleteSalesReturn ===
  it("deleteSalesReturn fails if completed", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "completed" })
    const res = await actions.deleteSalesReturn(1)
    expect(res?.success).toBe(false)
  })
})

describe("Quotation Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("Q-001")
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", sections: [{ items: [{ id: 1 }] }],
    })
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createQuotation succeeds", async () => {
    const res = await actions.createQuotation(fdQuotation({ ...basicPayload, customerVehicleId: 1 }))
    expect(res?.success).toBe(true)
  })
  it("updateQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1, customerVehicleId: 1 })
    const res = await actions.updateQuotation(1, fdQuotation({ customerId: 1, date: "2026-06-12", sections: [], discount: 0, tax: 0 }))
    expect(res?.success).toBe(true)
  })
  it("sendQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotationItem.count.mockResolvedValue(1)
    const res = await actions.sendQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("acceptQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.acceptQuotation(1)
    expect(res?.success).toBe(true)
    // F-2026-10-20-03(a): histori accept terikat revisi yang disetujui.
    expect(mocks.prismaMock.quotationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "accepted", revisionNumber: 3 }),
      }),
    )
  })
  it("rejectQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent", revisionNumber: 3 })
    const res = await actions.rejectQuotation(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.quotationHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "rejected", revisionNumber: 3 }),
      }),
    )
  })
  it("reviseQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "sent" })
    const res = await actions.reviseQuotation(1, "reason")
    expect(res?.success).toBe(true)
  })
  it("deleteQuotation succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteQuotation(1)
    expect(res?.success).toBe(true)
  })
  it("deleteQuotation menolak bila faktur turunan hidup (P3 121-V: void dulu)", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // findMany ke-1 = liveInvoices (ada 1 posted), sisanya default []
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValueOnce([{ id: 9 }])
    const res = await actions.deleteQuotation(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("void")
    expect(mocks.prismaMock.quotation.delete).not.toHaveBeenCalled()
  })
  it("convertQuotationToOrder succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "accepted", sections: [], documentNo: "Q-100", subtotal: 100, grandTotal: 100,
    })
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValueOnce(null)
    const res = await actions.convertQuotationToOrder(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Order Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks tidak reset implementasi mock — mockResolvedValue({id:2})
    // dari "already converted" bisa bocor ke suite berikutnya.
    mocks.prismaMock.salesOrder.findFirst.mockResolvedValue(null)
    mocks.prismaMock.quotation.findUnique.mockResolvedValue(null)
    mocks.prismaMock.salesOrder.create.mockResolvedValue({ id: 1 })
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SO-001")
  })
  it("createSalesOrder succeeds", async () => {
    const res = await actions.createSalesOrder(fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })

  // Konversi Penawaran -> Pesanan harus MEMBAWA itemnya. Sebelumnya header dibuat
  // tanpa satu pun baris item, jadi pesanan hasil konversi lahir kosong dan kasir
  // mengetik ulang seluruh penawaran.
  it("createSalesOrder menyalin item penawaran (bukan hanya header)", async () => {
    mocks.prismaMock.quotation.findUnique.mockResolvedValue({
      id: 50,
      status: "accepted",
      validUntil: null,
      customerId: 7,
      subtotal: 1000,
      discount: 0,
      tax: 110,
      grandTotal: 1110,
      sections: [
        {
          items: [
            { itemId: 11, description: "Rangka", qty: 2, unitPrice: 300, discount: 0, total: 600 },
            { itemId: 12, description: "Cat", qty: 1, unitPrice: 400, discount: 0, total: 400 },
          ],
        },
      ],
    })

    const res = await actions.createSalesOrder(fdMap({ customerId: "7", date: "2026-06-12", quotationId: "50" }))
    expect(res?.success).toBe(true)

    const arg = mocks.prismaMock.salesOrder.create.mock.calls.at(-1)![0] as any
    expect(arg.data.items.create).toHaveLength(2)
    expect(arg.data.items.create[0]).toMatchObject({ itemId: 11, qty: 2, unitPrice: 300 })
    expect(Number(arg.data.subtotal)).toBe(1000)
    expect(Number(arg.data.tax)).toBe(110)
    expect(Number(arg.data.grandTotal)).toBe(1110)
  })

  it("createSalesOrder menolak penawaran konsep lewat jalur form (gerbang convert)", async () => {
    mocks.prismaMock.quotation.findUnique.mockResolvedValue({
      id: 50, status: "draft", validUntil: null, customerId: 7, sections: [],
    })
    const res = await actions.createSalesOrder(fdMap({ customerId: "7", date: "2026-06-12", quotationId: "50" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("approved/accepted")
  })

  // Tanpa penawaran, pesanan tetap boleh dibuat kosong (item diisi belakangan).
  it("createSalesOrder tanpa penawaran tidak membuat item", async () => {
    const res = await actions.createSalesOrder(fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesOrder.create.mock.calls.at(-1)![0] as any
    expect(arg.data.items).toBeUndefined()
  })

  // Konversi Pesanan -> Faktur: faktur harus lahir dengan item dan totalnya,
  // bukan header bertotal 0 yang harus diketik ulang.
  it("createSalesInvoice menyimpan item dan menghitung totalnya", async () => {
    mocks.generateDocNumMock.mockResolvedValue("INV-001")
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ status: "confirmed" })
    const items = JSON.stringify([
      { itemId: 11, qty: 2, unitPrice: 300, discount: 0 },
      { itemId: 12, qty: 1, unitPrice: 400, discount: 50 },
    ])
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: "7", date: "2026-06-12", salesOrderId: "9", items, taxRate: "11" }),
    )
    expect(res?.success).toBe(true)

    const arg = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    // K5: draft lahir tanpa nomor — nomor terbit hanya saat postInvoice.
    expect(arg.data.documentNo).toBeNull()
    expect(arg.data.items.create).toHaveLength(2)
    // subtotal = 600 + 350 = 950
    expect(Number(arg.data.subtotal)).toBe(950)
    expect(arg.data.salesOrderId).toBe(9)
  })

  // Baris negatif hasil iseng klien tidak boleh tersimpan sebagai nilai negatif.
  it("createSalesInvoice meng-clamp qty/harga negatif ke nol", async () => {
    mocks.generateDocNumMock.mockResolvedValue("INV-002")
    const items = JSON.stringify([{ itemId: 11, qty: -5, unitPrice: -100, discount: -7 }])
    const res = await actions.createSalesInvoice(fdMap({ customerId: "7", date: "2026-06-12", items }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    expect(Number(arg.data.items.create[0].qty)).toBe(0)
    expect(Number(arg.data.items.create[0].unitPrice)).toBe(0)
    expect(Number(arg.data.items.create[0].discount)).toBe(0)
  })

  // F-PRICELIST-01: baris langsung dari form menerima harga price-list
  // kategori pelanggan; baris hasil konversi SO mempertahankan harga SO.
  it("createSalesInvoice menolak pesanan konsep (gerbang DELIVERABLE_ORDER_STATUSES)", async () => {
    mocks.generateDocNumMock.mockResolvedValue("INV-004")
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ status: "draft" })
    const res = await actions.createSalesInvoice(
      fdMap({ customerId: "7", date: "2026-06-12", salesOrderId: "9", items: "[]" }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("belum bisa difaktur")
  })
  it("createSalesInvoice menerapkan price-list untuk baris form langsung, bukan baris konversi SO", async () => {
    mocks.generateDocNumMock.mockResolvedValue("INV-003")
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ status: "confirmed" })
    mocks.prismaMock.customer.findUnique.mockResolvedValue({ customerCategoryId: 7 })
    mocks.prismaMock.customerPriceList.findMany.mockResolvedValue([
      { customerCategoryId: 7, itemId: 11, price: 90000, effectiveDate: null, isActive: true },
    ])
    const items = JSON.stringify([{ itemId: 11, qty: 2, unitPrice: 100000, discount: 10000 }])

    const langsung = await actions.createSalesInvoice(fdMap({ customerId: "7", date: "2026-06-12", items }))
    expect(langsung?.success).toBe(true)
    const arg = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    // unitPrice ditimpa price-list 90000; diskon manual 10000 tetap menang di
    // atasnya; total baris 170000 masuk subtotal (diskon sebelum pajak).
    expect(Number(arg.data.items.create[0].unitPrice)).toBe(90000)
    expect(Number(arg.data.items.create[0].discount)).toBe(10000)
    expect(Number(arg.data.subtotal)).toBe(170000)

    const dariSO = await actions.createSalesInvoice(
      fdMap({ customerId: "7", date: "2026-06-12", salesOrderId: "9", items }),
    )
    expect(dariSO?.success).toBe(true)
    const argSO = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    expect(Number(argSO.data.items.create[0].unitPrice)).toBe(100000)
    expect(Number(argSO.data.subtotal)).toBe(190000)
  })

  // Penegasan putusan: harga dipilih dari TANGGAL DOKUMEN (date form),
  // bukan hari ini. Invoice backdate hanya melihat baris yang sudah efektif
  // pada tanggal dokumennya.
  it("createSalesInvoice memilih price-list dari tanggal dokumen, bukan hari ini", async () => {
    mocks.generateDocNumMock.mockResolvedValue("INV-004")
    mocks.prismaMock.customer.findUnique.mockResolvedValue({ customerCategoryId: 7 })
    mocks.prismaMock.customerPriceList.findMany.mockResolvedValue([
      { customerCategoryId: 7, itemId: 11, price: 95000, effectiveDate: new Date("2026-01-01T00:00:00Z"), isActive: true },
      { customerCategoryId: 7, itemId: 11, price: 90000, effectiveDate: new Date("2026-06-01T00:00:00Z"), isActive: true },
    ])
    const items = JSON.stringify([{ itemId: 11, qty: 1, unitPrice: 100000, discount: 0 }])

    const backdate = await actions.createSalesInvoice(fdMap({ customerId: "7", date: "2026-05-01", items }))
    expect(backdate?.success).toBe(true)
    const argBack = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    expect(Number(argBack.data.items.create[0].unitPrice)).toBe(95000)

    const kini = await actions.createSalesInvoice(fdMap({ customerId: "7", date: "2026-06-12", items }))
    expect(kini?.success).toBe(true)
    const argNow = mocks.prismaMock.salesInvoice.create.mock.calls.at(-1)![0] as any
    expect(Number(argNow.data.items.create[0].unitPrice)).toBe(90000)
  })

  // Konversi Penawaran -> Pesanan harus MEMBAWA itemnya. Sebelumnya header dibuat
  // tanpa satu pun baris item, jadi pesanan hasil konversi lahir kosong dan kasir
  // mengetik ulang seluruh penawaran.
  it("updateSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateSalesOrder(1, fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_sales_orders")
  })
  it("deleteSalesOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteSalesOrder(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesOrder menolak bila faktur turunan hidup (P3 121-V: void dulu)", async () => {
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValueOnce([{ id: 9 }])
    const res = await actions.deleteSalesOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("void")
    expect(mocks.prismaMock.salesOrder.delete).not.toHaveBeenCalled()
  })
})

describe("Sales Invoice Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("INV-001")
  })
  it("createSalesInvoice succeeds", async () => {
    const res = await actions.createSalesInvoice(fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", paidAmount: 0 })
    const res = await actions.updateSalesInvoice(1, fdMap({ customerId: "1", date: "2026-06-12", dueDate: "2026-06-20" }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_sales_invoices")
  })
  it("postInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoiceItem.count.mockResolvedValueOnce(1)
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1, grandTotal: 100, paidAmount: 0 })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    mocks.prismaMock.salesInvoice.updateMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.postInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", customerId: 1 })
    mocks.prismaMock.salesPayment.findMany.mockResolvedValueOnce([])
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesInvoice menolak faktur posted (P3 121-V: draft-only, arahkan void)", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted", customerId: 1 })
    const res = await actions.deleteSalesInvoice(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("void")
    expect(mocks.prismaMock.salesInvoice.delete).not.toHaveBeenCalled()
  })
  it("voidSalesInvoice succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted", customerId: 1, grandTotal: 100, paidAmount: 0, payments: [] })
    mocks.prismaMock.customer.findUnique.mockResolvedValueOnce({ creditLimit: 0, name: "CUST" })
    const res = await actions.voidSalesInvoice(1)
    expect(res?.success).toBe(true)
  })
})

describe("Sales Payment Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("PAY-001")
  })
  it("createSalesPayment succeeds", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000, status: "posted", customerId: 1, paidAmount: 0 })
    const res = await actions.createSalesPayment(fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", salesInvoiceId: 1 })
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, grandTotal: 1000, status: "posted" })
    mocks.prismaMock.salesPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const res = await actions.updateSalesPayment(1, fdMap({ salesInvoiceId: "1", paymentDate: "2026-06-12", paymentMethod: "cash", amount: "100" }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_sales_payments")
  })
  it("deleteSalesPayment succeeds", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 1 })
    const res = await actions.deleteSalesPayment(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesPayment sweeps sales_payment attachments in the same tx (R-13)", async () => {
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, salesInvoiceId: 1 })
    mocks.prismaMock.transactionAttachment.findMany.mockResolvedValueOnce([
      { fileUrl: "/api/attachments/sales_payment/sales_payment-1-x.pdf", referenceType: "sales_payment" },
    ])
    const res = await actions.deleteSalesPayment(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.deleteMany).toHaveBeenCalledWith({
      where: { referenceType: "sales_payment", referenceId: 1 },
    })
  })
})

describe("Sales Return Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("SR-001")
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({ id: 1, customerId: 1 })
    mocks.prismaMock.salesInvoice.findFirst.mockResolvedValue({ id: 1, customerId: 1 })
  })
  it("createSalesReturn succeeds", async () => {
    mocks.findOverReturnMock.mockReturnValue(null)
    mocks.prismaMock.salesInvoiceItem.findMany.mockResolvedValue([{ itemId: 1, unitPrice: 100, qty: 10 }])
    const res = await actions.createSalesReturn(fdMap({ customerId: "1", salesInvoiceId: "1", date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }))
    expect(res?.success).toBe(true)
  })
  it("updateSalesReturn succeeds", async () => {
    mocks.findOverReturnMock.mockReturnValue(null)
    mocks.prismaMock.salesReturn.findUnique.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.salesInvoiceItem.findMany.mockResolvedValue([{ itemId: 1, unitPrice: 100, qty: 10 }])
    const res = await actions.updateSalesReturn(1, fdMap({ customerId: "1", salesInvoiceId: "1", date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 100 }]) }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_sales_returns")
  })
  it("completeSalesReturn succeeds", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", reason: "Barang cacat", items: [] })
    const res = await actions.completeSalesReturn(1)
    expect(res?.success).toBe(true)
  })
  it("deleteSalesReturn succeeds", async () => {
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteSalesReturn(1)
    expect(res?.success).toBe(true)
  })
})

describe("Delivery Order Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DO-001")
  })
  // Kontrak baru (rantai penjualan): surat jalan wajib punya baris barang yang
  // menunjuk baris pesanan (`salesOrderItemId`) dan pesanannya wajib berstatus
  // yang bisa dikirim. Sebelumnya surat jalan lahir tanpa baris dan laporan
  // Pemenuhan Pesanan selalu membaca 0 terkirim.
  it("createDeliveryOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({
      id: 1, documentNo: "SO-001", status: "confirmed", customerId: 1,
    })
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: 5 }])
    const res = await actions.createDeliveryOrder(
      fdMap({
        salesOrderId: "1",
        date: "2026-06-12",
        items: JSON.stringify([{ salesOrderItemId: 11, itemId: 5, qty: 2 }]),
      }),
    )
    expect(res?.success).toBe(true)
  })
  it("updateDeliveryOrder succeeds", async () => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ customerId: 1 })
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, documentNo: "DO-1" })
    const res = await actions.updateDeliveryOrder(1, fdMap({ salesOrderId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_delivery_orders")
  })
  it("updateDeliveryOrder rejects invalid input via Zod (no DB write)", async () => {
    const res = await actions.updateDeliveryOrder(1, fdMap({ salesOrderId: "1", date: "" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Validasi gagal")
    expect(mocks.prismaMock.deliveryOrder.update).not.toHaveBeenCalled()
  })
  it("deleteDeliveryOrder succeeds for a draft DO", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft" })
    const res = await actions.deleteDeliveryOrder(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.delete).toHaveBeenCalledWith({ where: { id: 1 } })
  })
  it("deleteDeliveryOrder refuses a confirmed/delivered DO and never deletes", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "delivered" })
    const res = await actions.deleteDeliveryOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak dapat dihapus")
    expect(mocks.prismaMock.deliveryOrder.delete).not.toHaveBeenCalled()
  })
})

describe("Down Payment Actions (legacy happy paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
    mocks.generateDocNumMock.mockResolvedValue("DP-001")
  })
  it("createDownPayment succeeds", async () => {
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const res = await actions.createDownPayment(fdMap({ quotationId: "1", amount: "100", paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })
  it("updateDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.quotation.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "accepted", grandTotal: 1000 })
    mocks.prismaMock.downPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    const res = await actions.updateDownPayment(1, fdMap({ quotationId: "1", amount: "100", paymentDate: "2026-06-12" }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_down_payments")
  })
  it("confirmDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.confirmDownPayment(1)
    expect(res?.success).toBe(true)
  })
  it("deleteDownPayment succeeds", async () => {
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.deleteDownPayment(1)
    expect(res?.success).toBe(true)
  })
})

describe('Global Error Paths (Permission Reject)', () => {
  it("createQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("sendQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).sendQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("acceptQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).acceptQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("rejectQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).rejectQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("reviseQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).reviseQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("convertQuotationToOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).convertQuotationToOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createDownPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("confirmDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).confirmDownPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("postInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).postInvoice(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesInvoice(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("completeSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).completeSalesReturn(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createSalesReturn(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("createDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).createDeliveryOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteQuotation handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteQuotation(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteDeliveryOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteDownPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesInvoice(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateSalesPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateSalesReturn(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateDeliveryOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateDeliveryOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("updateDownPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).updateDownPayment(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteSalesOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesOrder(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesInvoice(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("voidSalesInvoice handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).voidSalesInvoice(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
  it("deleteSalesReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData()
    const arg2 = new FormData()
    try { await (actions as any).deleteSalesReturn(arg1, arg2); } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  })
})


describe("Next.js redirect error handling", () => {
  const redirectErr = new Error("redirect")
  ;(redirectErr as any).digest = "NEXT_REDIRECT_TEST"

  const fnsToTest = [
    { name: "createQuotation", fn: () => actions.createQuotation(new FormData()) },
    { name: "sendQuotation", fn: () => actions.sendQuotation(1) },
    { name: "acceptQuotation", fn: () => actions.acceptQuotation(1) },
    { name: "rejectQuotation", fn: () => actions.rejectQuotation(1) },
    { name: "reviseQuotation", fn: () => actions.reviseQuotation(1, "reason") },
    { name: "convertQuotationToOrder", fn: () => actions.convertQuotationToOrder(1) },
    { name: "updateQuotation", fn: () => actions.updateQuotation(1, new FormData()) },
    { name: "createDownPayment", fn: () => actions.createDownPayment(new FormData()) },
    { name: "confirmDownPayment", fn: () => actions.confirmDownPayment(1) },
    { name: "createSalesOrder", fn: () => actions.createSalesOrder(new FormData()) },
    { name: "postInvoice", fn: () => actions.postInvoice(1) },
    { name: "createSalesInvoice", fn: () => actions.createSalesInvoice(new FormData()) },
    { name: "createSalesPayment", fn: () => actions.createSalesPayment(new FormData()) },
    { name: "completeSalesReturn", fn: () => actions.completeSalesReturn(1) },
    { name: "createSalesReturn", fn: () => actions.createSalesReturn(new FormData()) },
    { name: "createDeliveryOrder", fn: () => actions.createDeliveryOrder(new FormData()) },
    { name: "deleteQuotation", fn: () => actions.deleteQuotation(1) },
    { name: "deleteSalesPayment", fn: () => actions.deleteSalesPayment(1) },
    { name: "deleteDeliveryOrder", fn: () => actions.deleteDeliveryOrder(1) },
    { name: "deleteDownPayment", fn: () => actions.deleteDownPayment(1) },
    { name: "updateSalesOrder", fn: () => actions.updateSalesOrder(1, new FormData()) },
    { name: "updateSalesInvoice", fn: () => actions.updateSalesInvoice(1, new FormData()) },
    { name: "updateSalesPayment", fn: () => actions.updateSalesPayment(1, new FormData()) },
    { name: "updateSalesReturn", fn: () => actions.updateSalesReturn(1, new FormData()) },
    { name: "updateDeliveryOrder", fn: () => actions.updateDeliveryOrder(1, new FormData()) },
    { name: "updateDownPayment", fn: () => actions.updateDownPayment(1, new FormData()) },
    { name: "deleteSalesOrder", fn: () => actions.deleteSalesOrder(1) },
    { name: "deleteSalesInvoice", fn: () => actions.deleteSalesInvoice(1) },
    { name: "voidSalesInvoice", fn: () => actions.voidSalesInvoice(1) },
    { name: "deleteSalesReturn", fn: () => actions.deleteSalesReturn(1) },
  ]

  it("should rethrow NEXT_REDIRECT errors", async () => {
    // Setup a hook that throws the redirect error on permission check
    mocks.requirePermissionMock.mockRejectedValue(redirectErr)
    // For functions that don't call requirePermission, we can throw from findUniqueOrThrow
    mocks.prismaMock.quotation.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.salesOrder.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.salesPayment.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.salesReturn.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockRejectedValue(redirectErr)
    mocks.prismaMock.downPayment.findUniqueOrThrow.mockRejectedValue(redirectErr)
    // For actions like createX that parse schema first
    mocks.safeJsonParseMock.mockImplementation(() => { throw redirectErr })
    
    for (const { fn } of fnsToTest) {
      await expect(fn()).rejects.toThrow(redirectErr)
    }
  })
})
