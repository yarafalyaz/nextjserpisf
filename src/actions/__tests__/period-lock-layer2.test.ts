import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Lapis-2 period lock: aksi create/update faktur penjualan dan penyesuaian/
 * pemindahan stok harus menolak tanggal di periode tertutup SEBELUM mutasi.
 * (Lapis-1 tinggal di hook posting; faktur draft dan dokumen stok draft belum
 * memposting, jadi hook tidak menyala — guard di aksi menutup celah back-date.)
 */

const mocks = vi.hoisted(() => {
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
    aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
    groupBy: vi.fn().mockResolvedValue([]),
  })

  const prismaMock: any = {
    salesInvoice: buildModelMock(),
    salesInvoiceItem: buildModelMock(),
    salesPayment: buildModelMock(),
    salesPaymentAllocation: buildModelMock(),
    stockAdjustment: buildModelMock(),
    stockAdjustmentItem: buildModelMock(),
    inventoryTransfer: buildModelMock(),
    inventoryTransferItem: buildModelMock(),
    materialIssue: buildModelMock(),
    materialIssueItem: buildModelMock(),
    journal: buildModelMock(),
    customer: buildModelMock(),
    // F-2026-10-25-035-B: model gerbang kredit (saklar default mati di mock).
    systemSetting: buildModelMock(),
    salesOrder: buildModelMock(),
    downPayment: buildModelMock(),
    customerCredit: buildModelMock(),
    salesReturn: buildModelMock(),
    workOrder: buildModelMock(),
    quotation: buildModelMock(),
    creditOverride: buildModelMock(),
    item: buildModelMock(),
    stockMove: buildModelMock(),
    warehouse: buildModelMock(),
    userWarehouse: buildModelMock(),
    approvalWorkflow: buildModelMock(),
    approval: buildModelMock(),
    activityLog: buildModelMock(),
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
  }

  return {
    requirePermissionMock: vi.fn(),
    assertPeriodOpenMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    generateDocNumMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: mocks.generateDocNumMock }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: (...a: any) => mocks.assertPeriodOpenMock(...a),
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: vi.fn().mockResolvedValue({ kind: "all" }),
  assertWarehouseAccess: vi.fn(),
  assertWarehouseAccessMulti: vi.fn(),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onSalesInvoicePosted: vi.fn().mockResolvedValue(undefined),
  onSalesPaymentCreated: vi.fn().mockResolvedValue(undefined),
  onSalesReturnCompleted: vi.fn().mockResolvedValue(undefined),
  onDownPaymentReceived: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReference: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReferenceTx: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/down-payment.hook", () => ({ onDownPaymentConfirmed: vi.fn() }))
vi.mock("@/lib/hooks/sales-payment.hook", () => ({
  onSalesPaymentCreated: vi.fn(),
  onSalesPaymentUpdated: vi.fn(),
  onSalesPaymentDeleted: vi.fn(),
}))
vi.mock("@/lib/hooks/sales-return.hook", () => ({ onSalesReturnCompleted: vi.fn() }))
vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn().mockResolvedValue(undefined),
  onTransferReceived: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn(), notifyUser: vi.fn(), notifyRole: vi.fn() },
}))
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
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(undefined),
  assertApproved: vi.fn().mockResolvedValue(undefined),
}))

import { createSalesInvoice, updateSalesInvoice } from "../sales.actions"
import {
  createStockAdjustment,
  processStockAdjustment,
  createInventoryTransfer,
  processInventoryTransfer,
  receiveInventoryTransfer,
  createMaterialIssue,
  completeMaterialIssue,
  updateStockAdjustment,
  updateMaterialIssue,
  updateInventoryTransfer,
} from "../inventory.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

const LOCKED_ERROR = "Periode akuntansi sudah ditutup"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  mocks.assertPeriodOpenMock.mockResolvedValue(undefined)
  mocks.prismaMock.$transaction.mockImplementation(async (ops: any) => {
    if (typeof ops === "function") return ops(mocks.prismaMock)
    return Promise.all(ops)
  })
})

describe("lapis-2 period lock: faktur penjualan", () => {
  it("createSalesInvoice menolak tanggal tertutup sebelum mutasi", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await createSalesInvoice(fdMap({ customerId: "1", date: "2026-05-15" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledWith(expect.any(Date))
    expect(mocks.prismaMock.salesInvoice.create).not.toHaveBeenCalled()
  })

  it("createSalesInvoice memanggil guard dengan tanggal dokumen (periode terbuka)", async () => {
    const res = await createSalesInvoice(fdMap({ customerId: "1", date: "2026-06-12" }))
    expect(res?.success).toBe(true)
    expect(mocks.assertPeriodOpenMock).toHaveBeenCalledWith(expect.any(Date))
    const called = mocks.assertPeriodOpenMock.mock.calls[0][0] as Date
    expect(called.toISOString().slice(0, 10)).toBe("2026-06-12")
  })

  it("updateSalesInvoice menolak tanggal baru yang tertutup sebelum mutasi", async () => {
    mocks.prismaMock.salesInvoice.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", documentNo: "INV-1", paidAmount: 0,
    })
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await updateSalesInvoice(1, fdMap({ customerId: "1", date: "2026-05-15" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.salesInvoice.update).not.toHaveBeenCalled()
  })
})

describe("lapis-2 period lock: penyesuaian/pemindahan stok", () => {
  it("createStockAdjustment menolak tanggal tertutup sebelum mutasi", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await createStockAdjustment(
      fdMap({ warehouseId: 1, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled()
  })

  it("processStockAdjustment menolak dokumen bertanggal tertutup", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", warehouseId: 1, date: new Date("2026-05-15"), items: [],
    })
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await processStockAdjustment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.stockAdjustment.updateMany).not.toHaveBeenCalled()
  })

  it("createInventoryTransfer menolak tanggal tertutup sebelum mutasi", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await createInventoryTransfer(
      fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.inventoryTransfer.create).not.toHaveBeenCalled()
  })

  it("processInventoryTransfer menolak dokumen bertanggal tertutup", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", date: new Date("2026-05-15"), items: [],
    })
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await processInventoryTransfer(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.inventoryTransfer.updateMany).not.toHaveBeenCalled()
  })

  it("receiveInventoryTransfer menolak dokumen bertanggal tertutup", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "processed", date: new Date("2026-05-15"), items: [],
    })
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await receiveInventoryTransfer(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.inventoryTransfer.updateMany).not.toHaveBeenCalled()
  })

  it("createMaterialIssue menolak tanggal tertutup sebelum mutasi", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await createMaterialIssue(
      fdMap({ warehouseId: 1, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.materialIssue.create).not.toHaveBeenCalled()
  })

  it("completeMaterialIssue menolak dokumen bertanggal tertutup", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", warehouseId: 1, date: new Date("2026-05-15"), items: [],
    })
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await completeMaterialIssue(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.materialIssue.updateMany).not.toHaveBeenCalled()
  })

  it("updateStockAdjustment menolak tanggal baru yang tertutup", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await updateStockAdjustment(
      1, fdMap({ warehouseId: 1, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.stockAdjustment.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("updateMaterialIssue menolak tanggal baru yang tertutup", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await updateMaterialIssue(
      1, fdMap({ warehouseId: 1, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.materialIssue.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("updateInventoryTransfer menolak tanggal baru yang tertutup", async () => {
    mocks.assertPeriodOpenMock.mockRejectedValueOnce(new Error(LOCKED_ERROR))
    const res = await updateInventoryTransfer(
      1, fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-05-15", items: JSON.stringify([]) }),
    )
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(LOCKED_ERROR)
    expect(mocks.prismaMock.inventoryTransfer.findUniqueOrThrow).not.toHaveBeenCalled()
  })
})
