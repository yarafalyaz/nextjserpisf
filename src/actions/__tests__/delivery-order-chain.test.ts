import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Rantai Pesanan Penjualan → Surat Jalan.
 *
 * Dua mata rantai yang pernah putus dan dijaga di sini:
 *
 * 1. `createDeliveryOrder` dulu menulis surat jalan TANPA baris barang, sehingga
 *    `DeliveryOrderItem.salesOrderItemId` selalu kosong dan laporan Pemenuhan
 *    Pesanan selalu membaca 0 terkirim.
 * 2. Surat jalan tak punya jalan keluar dari konsep: tak ada aksi
 *    draft→shipped/delivered, sedangkan laporan hanya menghitung dua status itu.
 */

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
    salesOrder: buildModelMock(),
    salesOrderItem: buildModelMock(),
    salesInvoice: buildModelMock(),
    salesInvoiceItem: buildModelMock(),
    salesPayment: buildModelMock(),
    salesPaymentAllocation: buildModelMock(),
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
      if (typeof ops === "function") return ops(prismaMock)
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
    prismaMock,
  }
})

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

vi.mock("@/lib/utils/error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/utils/error")>()
  return { ...actual, isNextRedirectError: () => false }
})

vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => mocks.revalidateMock(...a) }))

vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))

vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => mocks.logActivityMock(...a),
}))

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => mocks.generateDocNumMock(...a),
}))

vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

vi.mock("@/lib/utils/safe-parse", async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, safeJsonParse: mocks.safeJsonParseMock }
})

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: {
    notifyAdmins: (...a: unknown[]) => mocks.notifyAdminsMock(...a),
    notifyUser: (...a: unknown[]) => mocks.notifyUserMock(...a),
    notifyRole: (...a: unknown[]) => mocks.notifyRoleMock(...a),
  },
}))

vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn(),
  onSalesPaymentCreated: vi.fn(),
  onSalesReturnCompleted: vi.fn(),
  onDownPaymentReceived: vi.fn(),
  deleteJournalByReference: vi.fn(),
  deleteJournalByReferenceTx: vi.fn(),
}))

vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: vi.fn(),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/services/quotation-sync.service", () => ({ resyncOnEdit: vi.fn() }))
vi.mock("@/lib/services/sales-settlement.service", () => ({
  DOWN_PAYMENT_METHOD: "down_payment",
  hasRealSettlement: vi.fn().mockResolvedValue(false),
  salesOrderHasRealSettlement: vi.fn().mockResolvedValue(false),
  quotationHasRealSettlement: vi.fn().mockResolvedValue(false),
}))
vi.mock("@/lib/services/sales-invoice-posting.service", () => ({
  reverseSalesInvoicePostingTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn().mockReturnValue(null) }))
vi.mock("fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

import * as actions from "../sales.actions"

function fdMap(payload: Record<string, string | number>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v))
  return f
}

/** Form surat jalan seperti yang dikirim `DeliveryOrderForm`. */
function fdDeliveryOrder(payload: {
  salesOrderId: number
  date?: string
  items: Array<{ salesOrderItemId: number; itemId: number; qty: number }>
}): FormData {
  return fdMap({
    salesOrderId: payload.salesOrderId,
    date: payload.date ?? "2026-06-12",
    items: JSON.stringify(payload.items),
  })
}

const DELIVERABLE_ORDER = { id: 1, documentNo: "SO-001", status: "confirmed", customerId: 7 }

describe("createDeliveryOrder menulis baris surat jalan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 3 })
    mocks.generateDocNumMock.mockResolvedValue("DO-001")
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue(DELIVERABLE_ORDER)
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: 5 }])
    mocks.prismaMock.deliveryOrder.create.mockResolvedValue({ id: 99 })
  })

  it("menyimpan items dengan salesOrderItemId dari baris pesanan", async () => {
    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 3 }] }),
    )

    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.deliveryOrder.create.mock.calls[0][0].data
    expect(data.items.create).toEqual([{ salesOrderItemId: 11, itemId: 5, qty: 3 }])
    // Pelanggan tetap disalin dari pesanan, bukan dikirim form.
    expect(data.customerId).toBe(7)
  })

  it("menggabungkan dua baris untuk baris pesanan yang sama", async () => {
    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({
        salesOrderId: 1,
        items: [
          { salesOrderItemId: 11, itemId: 5, qty: 3 },
          { salesOrderItemId: 11, itemId: 5, qty: 2 },
        ],
      }),
    )

    expect(res?.success).toBe(true)
    const data = mocks.prismaMock.deliveryOrder.create.mock.calls[0][0].data
    expect(data.items.create).toEqual([{ salesOrderItemId: 11, itemId: 5, qty: 5 }])
  })

  it("menolak baris yang bukan milik pesanan itu", async () => {
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([])

    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 999, itemId: 5, qty: 1 }] }),
    )

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("bukan milik pesanan ini")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("menolak baris yang tidak menunjuk barang katalog", async () => {
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: null }])

    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 1 }] }),
    )

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak menunjuk barang katalog")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("menolak surat jalan tanpa baris barang sama sekali", async () => {
    const res = await actions.createDeliveryOrder(fdDeliveryOrder({ salesOrderId: 1, items: [] }))

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("minimal satu baris barang")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })

  it("membuang baris ber-qty 0 dari payload", async () => {
    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 0 }] }),
    )

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("minimal satu baris barang")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })
})

describe("createDeliveryOrder: gerbang status di server", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 3 })
    mocks.generateDocNumMock.mockResolvedValue("DO-001")
    mocks.prismaMock.salesOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: 5 }])
    mocks.prismaMock.deliveryOrder.create.mockResolvedValue({ id: 99 })
  })

  it.each(["draft", "cancelled", "pending"])(
    "menolak pesanan berstatus %s walau barisnya benar",
    async (status) => {
      mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ ...DELIVERABLE_ORDER, status })

      const res = await actions.createDeliveryOrder(
        fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 1 }] }),
      )

      expect(res?.success).toBe(false)
      expect(res?.error).toContain("Surat jalan hanya bisa dibuat")
      expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
    },
  )

  // `approved` adalah status yang lahir dari tombol Setujui di halaman pesanan
  // (jalur /api/workflow tanpa workflow terkonfigurasi). Kalau status ini ditolak
  // di server, tombol setujui berubah jadi buntu senyap.
  it.each(["approved", "confirmed", "processing", "completed"])(
    "menerima pesanan berstatus %s",
    async (status) => {
      mocks.prismaMock.salesOrder.findUnique.mockResolvedValue({ ...DELIVERABLE_ORDER, status })

      const res = await actions.createDeliveryOrder(
        fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 1 }] }),
      )

      expect(res?.success).toBe(true)
    },
  )

  it("menolak pesanan yang tidak ada", async () => {
    mocks.prismaMock.salesOrder.findUnique.mockResolvedValue(null)

    const res = await actions.createDeliveryOrder(
      fdDeliveryOrder({ salesOrderId: 1, items: [{ salesOrderItemId: 11, itemId: 5, qty: 1 }] }),
    )

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ditemukan")
    expect(mocks.prismaMock.deliveryOrder.create).not.toHaveBeenCalled()
  })
})

describe("shipDeliveryOrder: draft → shipped", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 3 })
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft", documentNo: "DO-001" })
    mocks.prismaMock.deliveryOrderItem.count.mockResolvedValue(2)
    mocks.prismaMock.deliveryOrder.updateMany.mockResolvedValue({ count: 1 })
  })

  it("menstempel shipped + confirmedBy/confirmedAt", async () => {
    const res = await actions.shipDeliveryOrder(9)

    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: "draft" },
      data: { status: "shipped", confirmedBy: 3, confirmedAt: expect.any(Date) },
    })
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_delivery_orders")
  })

  it("menolak surat jalan yang sudah dikirim", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "shipped", documentNo: "DO-001" })

    const res = await actions.shipDeliveryOrder(9)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya surat jalan konsep")
    expect(mocks.prismaMock.deliveryOrder.updateMany).not.toHaveBeenCalled()
  })

  // Laporan menghitung baris surat jalan, bukan status surat jalannya saja. Surat
  // jalan tanpa baris yang boleh jadi "dikirim" hanya memindahkan labelnya.
  it("menolak surat jalan tanpa baris barang", async () => {
    mocks.prismaMock.deliveryOrderItem.count.mockResolvedValue(0)

    const res = await actions.shipDeliveryOrder(9)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak punya baris barang")
    expect(mocks.prismaMock.deliveryOrder.updateMany).not.toHaveBeenCalled()
  })

  it("kalah lomba klaim atomik (updateMany 0 baris)", async () => {
    mocks.prismaMock.deliveryOrder.updateMany.mockResolvedValue({ count: 0 })

    const res = await actions.shipDeliveryOrder(9)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah diproses")
  })
})

describe("deliverDeliveryOrder: shipped → delivered", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 3 })
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "shipped", documentNo: "DO-001" })
    mocks.prismaMock.deliveryOrder.updateMany.mockResolvedValue({ count: 1 })
  })

  it("menstempel delivered + deliveredAt", async () => {
    const res = await actions.deliverDeliveryOrder(9)

    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.deliveryOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 9, status: "shipped" },
      data: { status: "delivered", deliveredAt: expect.any(Date) },
    })
  })

  it("menolak surat jalan yang masih konsep", async () => {
    mocks.prismaMock.deliveryOrder.findUniqueOrThrow.mockResolvedValue({ status: "draft", documentNo: "DO-001" })

    const res = await actions.deliverDeliveryOrder(9)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tandai dikirim dulu")
    expect(mocks.prismaMock.deliveryOrder.updateMany).not.toHaveBeenCalled()
  })
})
