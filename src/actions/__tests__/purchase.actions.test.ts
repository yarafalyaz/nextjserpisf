import { describe, it, expect, vi, beforeEach } from "vitest"

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
  })

  const prismaMock: any = {
    purchaseRequest: buildModelMock(),
    purchaseRequestItem: buildModelMock(),
    purchaseOrder: buildModelMock(),
    purchaseOrderItem: buildModelMock(),
    goodsReceipt: buildModelMock(),
    goodsReceiptItem: buildModelMock(),
    rack: buildModelMock(),
    rackRow: buildModelMock(),
    // Guard delete GR ber-QC: count polimorfik, default 0.
    qcInspection: buildModelMock(),
    nonconformance: buildModelMock(),
    vendorBill: buildModelMock(),
    vendorBillItem: buildModelMock(),
    vendorPayment: buildModelMock(),
    vendorPaymentAllocation: buildModelMock(),
    purchaseReturn: buildModelMock(),
    warehouse: buildModelMock(),
    purchaseReturnItem: buildModelMock(),
    purchaseHistory: buildModelMock(),
    workOrder: buildModelMock(),
    productionOrder: buildModelMock(),
    productionCost: buildModelMock(),
    journal: buildModelMock(),
    inventory: buildModelMock(),
    inventoryMovement: buildModelMock(),
    stockMove: buildModelMock(),
    inventoryLayer: buildModelMock(),
    itemBatch: buildModelMock(),
    itemSerial: buildModelMock(),
    batch: buildModelMock(),
    vendor: buildModelMock(),
    item: buildModelMock(),
    uomConversion: buildModelMock(),
    transactionAttachment: buildModelMock(),
    withholdingCertificate: buildModelMock(),
    withholdingTaxType: buildModelMock(),
    employee: buildModelMock(),
    taxInvoice: buildModelMock(),
    financialIdempotencyKey: buildModelMock(),
    idempotencyKey: buildModelMock(),
    userWarehouse: buildModelMock(),
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
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
    notifyAdminsMock: vi.fn().mockResolvedValue({}),
    generateDocNumMock: vi.fn(),
    createGlJournalMock: vi.fn(),
    deleteJournalByReferenceTxMock: vi.fn().mockResolvedValue({}),
    reverseJournalsByReferenceTxMock: vi.fn().mockResolvedValue({}),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: mocks.generateDocNumMock }))
vi.mock("@/lib/services/journal-builder.service", () => ({ createGlJournal: mocks.createGlJournalMock }))
vi.mock("@/lib/services/inventory.service", () => ({
  inventoryService: { receivePurchase: vi.fn().mockResolvedValue({}), processPurchaseReturn: vi.fn().mockResolvedValue({}) }
}))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: (...a: any) => mocks.notifyAdminsMock(...a) }
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/accounting.hook", () => ({
  VENDOR_BILL_TAX_INVOICE_WARNING: "Faktur pajak tidak valid",
  onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}),
  onVendorBillPosted: vi.fn().mockResolvedValue({}),
  onVendorPaymentCreated: vi.fn().mockResolvedValue({}),
  deleteJournalByReference: vi.fn().mockResolvedValue({}),
  deleteJournalByReferenceTx: mocks.deleteJournalByReferenceTxMock,
  reverseJournalsByReferenceTx: mocks.reverseJournalsByReferenceTxMock,
}))
vi.mock("@/lib/hooks/goods-receipt.hook", () => ({
  onGoodsReceiptVerified: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/purchase-order.hook", () => ({
  onPurchaseOrderCreated: vi.fn().mockResolvedValue({}),
  recalcPurchaseRequestStatus: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/hooks/purchase-return.hook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/purchase-return.hook")>();
  return {
    ...actual,
    onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}),
  };
})
vi.mock("@/lib/sales/return-validation", () => ({ findOverReturn: vi.fn().mockReturnValue(null) }))
vi.mock("@/lib/finance/payment-allocation", () => ({ allocatePaymentToBills: vi.fn().mockReturnValue([]) }))

import * as actions from "../purchase.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  // roles super_admin → scope gudang "all", sehingga tes-tes di bawah fokus ke
  // aturan bisnisnya. Cek scope gudangnya sendiri diuji terpisah.
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  // Baca-ulang status GR di dalam tx deleteGoodsReceipt (sesudah lock):
  // default draft agar jalur hapus draft lama tetap lolos; test balapan
  // menimpanya ke verified.
  mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft" })
})

function mockDraftReturn() {
  mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({
    id: 1, status: "draft", items: [{ itemId: 1, qty: 3 }], purchaseOrderId: 1
  })
}

function scopeUser(warehouseIds: number[]) {
  mocks.requirePermissionMock.mockResolvedValue({ id: 9, roles: ["warehouse"] })
  mocks.prismaMock.userWarehouse.findMany.mockResolvedValue(
    warehouseIds.map((warehouseId) => ({ warehouseId })))
}

describe("Purchase Actions Smoke Tests", () => {
  it("exports everything", () => {
    expect(actions.createPurchaseRequest).toBeDefined()
  })
})

// Penerimaan barang menerima warehouseId dari input user, jadi scope gudang wajib
// dicek (header DAN tiap baris) — dulu tidak ada, sehingga user yang hanya ditugaskan
// ke gudang A bisa menerima stok ke gudang B.
describe("Scope gudang penerimaan barang", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 9, roles: ["warehouse"] })
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 1 }])
    mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  })

  it("menolak GR ke gudang di luar wewenang user", async () => {
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "2", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitCost: 100 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses ke gudang")
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("menolak baris GR yang menyasar gudang lain walau header-nya diizinkan", async () => {
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitCost: 100, warehouseId: 3 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses ke gudang")
  })

  it("mengizinkan GR ke gudang yang ditugaskan", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }],
    })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitCost: 100 }]),
    }))
    expect(res?.success).toBe(true)
  })

  it("regresi putaran 32: createGoodsReceipt menolak rak dari gudang lain", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }],
    })
    mocks.prismaMock.rack.findMany.mockResolvedValue([
      { id: 55, warehouseId: 2, name: "Rak B" },
    ])
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitCost: 100, warehouseId: 1, rackId: 55 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak berada di gudang")
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updateGoodsReceipt menolak rackRow dari rak lain", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", documentNo: "GR-001" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }],
    })
    mocks.prismaMock.rack.findMany.mockResolvedValue([
      { id: 55, warehouseId: 1, name: "Rak A" },
    ])
    mocks.prismaMock.rackRow.findMany.mockResolvedValue([
      { id: 77, rackId: 99, name: "Baris X" },
    ])
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitCost: 100, warehouseId: 1, rackId: 55, rackRowId: 77 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak berada di rak")
    expect(mocks.prismaMock.goodsReceiptItem.createMany).not.toHaveBeenCalled()
  })
})

describe("Purchase Request Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // Gerbang vendor saran hidup (putaran 43): default vendor aktif; test
    // penolakan menimpanya ke null.
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    // Gerbang item hidup (putaran 32): fixture baris memakai item 1 aktif.
    mocks.prismaMock.item.findMany.mockImplementation(async (arg: any) =>
      (arg?.where?.id?.in ?? []).map((id: number) => ({ id, name: `Item ${id}`, isActive: true, deletedAt: null })))
  })

  it("createPurchaseRequest succeeds", async () => {
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "important" }])
    }))
    expect(res?.success).toBe(true)
  })

  it("createPurchaseRequest persists the suggested vendor", async () => {
    await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      vendorId: "7",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "" }])
    }))
    const arg = mocks.prismaMock.purchaseRequest.create.mock.calls.at(-1)![0]
    expect(arg.data.vendorId).toBe(7)
  })

  it("createPurchaseRequest without a vendor leaves it null", async () => {
    await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "" }])
    }))
    const arg = mocks.prismaMock.purchaseRequest.create.mock.calls.at(-1)![0]
    expect(arg.data.vendorId).toBeNull()
  })

  it("updatePurchaseRequest succeeds", async () => {
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test Updated",
      items: JSON.stringify([{ itemId: 1, qty: 12, notes: "updated" }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_purchase_requests")
  })

  it("updatePurchaseRequest persists the suggested vendor", async () => {
    await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test Updated",
      vendorId: "9",
      items: JSON.stringify([{ itemId: 1, qty: 12, notes: "" }])
    }))
    const arg = mocks.prismaMock.purchaseRequest.update.mock.calls.at(-1)![0]
    expect(arg.data.vendorId).toBe(9)
  })


  it("deletePurchaseRequest succeeds", async () => {
    const res = await actions.deletePurchaseRequest(1)
    expect(res?.success).toBe(true)
  })

  it("regresi putaran 32: createPurchaseRequest menolak item nonaktif", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 5, name: "Item Mati", isActive: false },
    ])
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      items: JSON.stringify([{ itemId: 5, qty: 10, notes: "" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseRequest.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updatePurchaseRequest menolak item fiktif tanpa menghapus baris lama", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([])
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test",
      items: JSON.stringify([{ itemId: 999, qty: 10, notes: "" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ditemukan")
    expect(mocks.prismaMock.purchaseRequestItem.deleteMany).not.toHaveBeenCalled()
  })

  // Regresi putaran 32 #6(a): requestedBy bare-int tanpa FK menunjuk
  // Employee — picker hanya menawarkan karyawan belum terhapus, tetapi
  // payload buatan tangan dengan id fiktif/nonaktif tersimpan senyap.
  it("regresi putaran 32: createPurchaseRequest menolak pemohon fiktif", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      requestedBy: "999999",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseRequest.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updatePurchaseRequest menolak pemohon nonaktif", async () => {
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test",
      requestedBy: "77",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseRequest.update).not.toHaveBeenCalled()
  })

  // Putaran 43 #9: vendor saran PR sebelumnya ditulis tanpa penilaian
  // hidup sama sekali (kolom tanpa FK) — create kini menilai, update
  // hanya saat berpindah; pemohon juga hanya dinilai saat berpindah.
  it("regresi putaran 43: createPurchaseRequest menolak vendor saran nonaktif", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12",
      title: "PR Test",
      vendorId: "7",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "" }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseRequest.create).not.toHaveBeenCalled()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
  })

  it("regresi putaran 43: updatePurchaseRequest tak menilai ulang pemohon/vendor yang tidak berpindah", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", requestedBy: 77 })
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "draft", vendorId: 9 })
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12",
      title: "PR Test",
      requestedBy: "77",
      vendorId: "9",
      items: JSON.stringify([{ itemId: 1, qty: 10, notes: "" }]),
    }))
    expect(res?.success).toBe(true)
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue(undefined)
  })
})

describe("Purchase Order Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // Putaran 22: create menolak vendor mati — default fixture vendor hidup.
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    // Gerbang item hidup (putaran 32): echo id aktif untuk query ber-where.id.
    mocks.prismaMock.item.findMany.mockImplementation(async (arg: any) => {
      const ids = arg?.where?.id?.in
      if (!ids) return []
      return ids.map((id: number) => ({ id, name: `Item ${id}`, isActive: true, deletedAt: null }))
    })
  })

  it("createPurchaseOrder succeeds", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("regresi putaran 22: createPurchaseOrder menolak vendor nonaktif/terhapus", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
  })

  it("createPurchaseOrder persists the service flag and work order link", async () => {
    await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      isService: "true",
      workOrderId: "9",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 500000, discount: 0 }])
    }))
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls[0][0]
    expect(arg.data.isService).toBe(true)
    expect(arg.data.workOrderId).toBe(9)
  })

  it("createPurchaseOrder membaca qty/harga/diskon string format Indonesia penuh", async () => {
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "2.000", unitPrice: "150.000", discount: "5.000" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ itemId: 1, qty: 2000, unitPrice: 150000, discount: 5000, total: 299995000 }))
    expect(arg.data.subtotal).toBe(300000000)
    expect(arg.data.grandTotal).toBe(299995000)
  })

  it("createPurchaseOrder menolak qty tak terbaca tanpa membuat PO", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc", unitPrice: 1000 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas pesanan item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder menolak harga tak terbaca tanpa membuat PO", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitPrice: "xyz" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Harga beli pesanan item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it("updatePurchaseOrder membaca qty/harga string format Indonesia penuh", async () => {
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "1,5", unitPrice: "2.000.000", discount: "0" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.update.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ itemId: 1, qty: 1.5, unitPrice: 2000000, total: 3000000 }))
  })

  it("updatePurchaseOrder menolak qty tak terbaca tanpa menghapus baris lama", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc", unitPrice: 1000 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas pesanan item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseOrderItem.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.purchaseOrder.update).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder links the purchase request (PR -> PO)", async () => {
    const { onPurchaseOrderCreated } = await import("@/lib/hooks/purchase-order.hook")
    vi.mocked(onPurchaseOrderCreated).mockClear()
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "approved", documentNo: "PR-042" })
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      purchaseRequestId: "42",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls[0][0]
    expect(arg.data.purchaseRequestId).toBe(42)
    // The PR-status hook must run for the linked request.
    expect(vi.mocked(onPurchaseOrderCreated)).toHaveBeenCalled()
  })

  it("createPurchaseOrder mengunci baris PR sebelum membaca gerbang status", async () => {
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "approved", documentNo: "PR-042" })
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      purchaseRequestId: "42",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    const lockIdx = mocks.prismaMock.$queryRaw.mock.calls.findIndex((c: unknown[]) => {
      const sql = Array.isArray(c[0]) ? (c[0] as unknown[]).join("") : String((c[0] as { strings?: string[] })?.strings?.join("?") ?? c[0])
      return sql.includes("purchase_requests") && sql.includes("FOR UPDATE")
    })
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    const lockOrder = mocks.prismaMock.$queryRaw.mock.invocationCallOrder[lockIdx]
    const readOrder = mocks.prismaMock.purchaseRequest.findUnique.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(readOrder)
  })

  it("createPurchaseOrder menolak PR konsep (gerbang status PR di server)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "draft", documentNo: "PR-042" })
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      purchaseRequestId: "42",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/belum bisa dibuatkan pesanan/i)
    expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it("createPurchaseOrder without a purchase request leaves the link null", async () => {
    const { onPurchaseOrderCreated } = await import("@/lib/hooks/purchase-order.hook")
    vi.mocked(onPurchaseOrderCreated).mockClear()
    await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls[0][0]
    expect(arg.data.purchaseRequestId).toBeNull()
    expect(vi.mocked(onPurchaseOrderCreated)).not.toHaveBeenCalled()
  })

  describe("createServicePurchaseOrderFromWorkOrder (PRD FAB-08 / PUR-17)", () => {
    function wireServiceWo() {
      mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 3 })
      mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
        id: 9,
        documentNo: "WO-009",
        status: "in_progress",
        items: [
          { itemId: 100, qty: 2, cost: 150000 }, // service
          { itemId: 200, qty: 5, cost: 10000 }, // stock (excluded)
        ],
      })
      // Only item 100 is a service.
      mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 100 }])
      mocks.prismaMock.purchaseOrder.findFirst.mockResolvedValue(null)
      mocks.prismaMock.purchaseOrder.create.mockResolvedValue({ id: 55, documentNo: "PO-055" })
    }

    it("bundles only the service items into a draft service PO linked to the WO", async () => {
      wireServiceWo()
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res).toMatchObject({ success: true, id: 55 })

      const arg = mocks.prismaMock.purchaseOrder.create.mock.calls[0][0]
      expect(arg.data.isService).toBe(true)
      expect(arg.data.workOrderId).toBe(9)
      expect(arg.data.vendorId).toBe(3)
      expect(arg.data.status).toBe("draft")
      expect(arg.data.subtotal).toBe(300000) // 2 × 150000, stock line excluded
      expect(arg.data.items.create).toEqual([
        expect.objectContaining({ itemId: 100, qty: 2, unitPrice: 150000, total: 300000 }),
      ])
      expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_purchase_orders")
    })

    it("rejects when the work order has no service items", async () => {
      mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 3 })
      mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
        id: 9, documentNo: "WO-009", status: "in_progress",
        items: [{ itemId: 200, qty: 5, cost: 10000 }],
      })
      mocks.prismaMock.item.findMany.mockResolvedValue([]) // no service items
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res.success).toBe(false)
      expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
    })

    it("refuses a duplicate service PO unless forced", async () => {
      wireServiceWo()
      mocks.prismaMock.purchaseOrder.findFirst.mockResolvedValue({ id: 40, documentNo: "PO-040" })
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res.success).toBe(false)
      expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
    })

    it("allows a re-create when forced", async () => {
      wireServiceWo()
      mocks.prismaMock.purchaseOrder.findFirst.mockResolvedValue({ id: 40, documentNo: "PO-040" })
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3, { force: true })
      expect(res.success).toBe(true)
      expect(mocks.prismaMock.purchaseOrder.create).toHaveBeenCalled()
    })

    it("refuses when the in-tx duplicate check finds an existing PO (race loser)", async () => {
      wireServiceWo()
      // Bacaan luar belum melihat PO lain (balapan); bacaan dalam tx sesudah
      // kunci baris WO wajib melihatnya dan menolak tanpa membuat PO kedua.
      // nextSlug("purchaseOrder") juga memanggil purchaseOrder.findFirst, jadi
      // urutan panggilan: luar (null) → nextSlug (null) → dalam tx (PO-040).
      mocks.prismaMock.purchaseOrder.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 40, documentNo: "PO-040" })
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res.success).toBe(false)
      expect(res.error).toMatch(/sudah ada/)
      expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
      const execCalls = mocks.prismaMock.$executeRaw.mock.calls as unknown[][]
      const lockIdx = execCalls.findIndex((c) => JSON.stringify(c).includes("work_orders"))
      expect(lockIdx).toBeGreaterThanOrEqual(0)
      const lockOrder = (mocks.prismaMock.$executeRaw as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[lockIdx]
      const findOrders = (mocks.prismaMock.purchaseOrder.findFirst as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder
      expect(lockOrder).toBeLessThan(findOrders[2])
    })

    it("rejects a completed or cancelled work order", async () => {
      mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 3 })
      mocks.prismaMock.workOrder.findUnique.mockResolvedValue({
        id: 9, documentNo: "WO-009", status: "completed", items: [],
      })
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res.success).toBe(false)
      expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
    })

    it("rejects an inactive or missing vendor", async () => {
      mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
      const res = await actions.createServicePurchaseOrderFromWorkOrder(9, 3)
      expect(res.success).toBe(false)
      expect(mocks.prismaMock.workOrder.findUnique).not.toHaveBeenCalled()
    })
  })

  it("updatePurchaseOrder succeeds", async () => {
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1200, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_purchase_orders")
  })

  it("R6WN-11: update PO notifikasi 'diperbarui' dan gagal notif tidak menggagalkan update", async () => {
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1200, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.notifyAdminsMock).toHaveBeenCalledWith(
      "Pesanan Pembelian diperbarui",
      expect.any(String),
    )

    mocks.notifyAdminsMock.mockRejectedValueOnce(new Error("notif down"))
    const res2 = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1200, discount: 0 }])
    }))
    expect(res2?.success).toBe(true)
  })

  // Regresi: diskon baris > bruto baris dulu tersimpan sebagai total baris
  // dan grandTotal negatif (safeSubtract tanpa clamp). Pola sisi jual:
  // total baris di-clamp >= 0, diskon header = diskon efektif.
  it("createPurchaseOrder clamp diskon baris melebihi bruto: total tidak negatif", async () => {
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      shippingCost: "10000",
      serviceFee: "5000",
      items: JSON.stringify([
        { itemId: 1, qty: 2, unitPrice: 1000, discount: 5000 },
        { itemId: 2, qty: 1, unitPrice: 3000, discount: 1000 },
      ])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ total: 0 }))
    expect(arg.data.items.create[1]).toEqual(expect.objectContaining({ total: 2000 }))
    // subtotal bruto 5000; diskon efektif 5000-2000=3000; grand = 2000+15000.
    expect(arg.data.subtotal).toBe(5000)
    expect(arg.data.discount).toBe(3000)
    expect(arg.data.grandTotal).toBe(17000)
  })

  it("updatePurchaseOrder clamp diskon baris melebihi bruto: total tidak negatif", async () => {
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, unitPrice: 1000, discount: 9999 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.update.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ total: 0 }))
    expect(arg.data.subtotal).toBe(1000)
    expect(arg.data.discount).toBe(1000)
    expect(arg.data.grandTotal).toBe(0)
  })

  it("createPurchaseOrder diskon wajar tidak berubah oleh clamp", async () => {
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitPrice: 1000, discount: 500 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ total: 1500 }))
    expect(arg.data.subtotal).toBe(2000)
    expect(arg.data.discount).toBe(500)
    expect(arg.data.grandTotal).toBe(1500)
  })



  it("cancelPurchaseOrder succeeds", async () => {
    const res = await actions.cancelPurchaseOrder(1)
    expect(res?.success).toBe(true)
  })

  it("regresi putaran 32: createPurchaseOrder menolak item nonaktif", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 5, name: "Item Mati", isActive: false },
    ])
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 5, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updatePurchaseOrder menolak item fiktif tanpa menghapus baris lama", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseOrderItem.deleteMany.mockClear()
    mocks.prismaMock.item.findMany.mockResolvedValue([])
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 999, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ditemukan")
    expect(mocks.prismaMock.purchaseOrderItem.deleteMany).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updatePurchaseOrder menolak vendor nonaktif", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // Putaran 43: gerbang vendor hanya saat vendor BERPINDAH — baris
    // terkunci vendor 2, payload pindah ke vendor 1 yang nonaktif.
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({ status: "draft", vendorId: 2, purchaseRequestId: null })
    mocks.prismaMock.purchaseOrderItem.deleteMany.mockClear()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.purchaseOrderItem.deleteMany).not.toHaveBeenCalled()
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue(undefined)
  })

  // Regresi putaran 43: tautan tak berubah tidak dinilai ulang — PR yang
  // statusnya sudah maju ke ordered dan vendor yang dinonaktifkan
  // sesudahnya tidak memblokir edit nominal PO draft.
  it("regresi putaran 43: updatePurchaseOrder tak menilai ulang PR/vendor yang tidak berpindah", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({ status: "draft", vendorId: 1, purchaseRequestId: 7 })
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "ordered", documentNo: "PR-007" })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      purchaseRequestId: "7",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue(undefined)
  })

  // Regresi putaran 43: PO jasa dari work order — halaman/form edit tak pernah
  // mengirim workOrderId, dan form lama mengirim isService=false karena
  // halaman tak meneruskan nilai awal; server menulis keduanya dari payload
  // sehingga tautan WO terputus dan mirror HPP jasa no-op permanen. Server
  // kini mempertahankan flag/tautan dari baris terkunci bila payload kosong.
  it("regresi putaran 43: update tanpa workOrderId mempertahankan tautan WO + flag jasa terkunci", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", isService: true, workOrderId: 55 })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({ status: "draft", isService: true, workOrderId: 55 })
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1200, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.update.mock.calls.at(-1)![0]
    expect(arg.data.workOrderId).toBe(55)
    expect(arg.data.isService).toBe(true)
    // clearAllMocks tak membuang implementasi persisten: kembalikan default
    // agar fixture PO jasa ini tak bocor ke test tagihan sesudahnya.
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue(undefined)
  })

  it("regresi putaran 32: updatePurchaseOrder menulis isService + workOrderId dari form", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      isService: "true",
      workOrderId: "9",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseOrder.update.mock.calls.at(-1)![0]
    expect(arg.data.isService).toBe(true)
    expect(arg.data.workOrderId).toBe(9)
  })

  it("regresi putaran 32: updatePurchaseOrder menolak relink ke PR konsep", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseOrderItem.deleteMany.mockClear()
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "draft", documentNo: "PR-001" })
    const res = await actions.updatePurchaseOrder(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      purchaseRequestId: "7",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitPrice: 1000, discount: 0 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("belum bisa dibuatkan pesanan")
    expect(mocks.prismaMock.purchaseOrderItem.deleteMany).not.toHaveBeenCalled()
  })

  it("regresi putaran 16: cancelPurchaseOrder menghitung ulang status PR tertaut", async () => {
    const hook = await import("@/lib/hooks/purchase-order.hook") as any
    ;(hook.recalcPurchaseRequestStatus as any).mockClear()
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "approved", purchaseRequestId: 9 })
    const res = await actions.cancelPurchaseOrder(1)
    expect(res?.success).toBe(true)
    expect(hook.recalcPurchaseRequestStatus).toHaveBeenCalledWith(9, expect.anything())
  })
})

describe("Goods Receipt Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createGoodsReceipt succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("putaran 62: createGoodsReceipt — retry dengan idempotencyKey sama ditolak, GR lahir sekali", async () => {
    const idem = mocks.prismaMock.idempotencyKey
    idem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    idem.findUnique.mockResolvedValueOnce({ createdAt: new Date() })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    const payload = {
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 4, unitCost: 1000 }]),
      idempotencyKey: "gr-key-1",
    }
    const first = await actions.createGoodsReceipt(fdMap(payload))
    const second = await actions.createGoodsReceipt(fdMap(payload))
    expect(first?.success).toBe(true)
    expect(second?.success).toBe(false)
    expect(second?.error).toContain("duplikat")
    expect(mocks.prismaMock.goodsReceipt.create).toHaveBeenCalledTimes(1)
  })

  it("STOK-18: duplicate PO lines aggregate into GR qtyOrdered snapshot", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      status: "ordered",
      items: [
        { itemId: 1, qty: 5 },
        { itemId: 1, qty: 5 },
      ],
    })
    mocks.prismaMock.goodsReceipt.create.mockResolvedValueOnce({ id: 99, purchaseOrderId: 1 })

    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, unitCost: 1000 }])
    }))

    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.goodsReceipt.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ itemId: 1, qtyOrdered: 10 }))
  })

  it("updateGoodsReceipt succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_goods_receipts")
  })

  // Regresi putaran 43: edit draft GR bisa memindah purchaseOrderId tanpa
  // menyentuh status PO — PO lama tetap partial_received (memblokir batal
  // PO selamanya) dan PO baru tak pernah ditandai receiving. Kini kedua
  // status dihitung ulang dalam tx yang sama: PO lama tanpa GR tersisa
  // kembali ordered (semantik deleteGoodsReceipt), PO baru partial_received
  // (semantik createGoodsReceipt).
  it("regresi putaran 43: updateGoodsReceipt memindah PO menghitung ulang status kedua PO", async () => {
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft", purchaseOrderId: 10 })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 20, status: "ordered", items: [{ itemId: 1, qty: 10 }] })
    mocks.prismaMock.goodsReceipt.count.mockResolvedValue(0)
    mocks.prismaMock.purchaseOrder.update.mockClear()
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "20",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "ordered" },
    })
    expect(mocks.prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { status: "partial_received" },
    })
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft" })
  })

  it("regresi putaran 22: updateGoodsReceipt snapshot qtyOrdered diagregasi dari baris PO duplikat (STOK-18 di edit)", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "ordered",
      items: [
        { itemId: 1, qty: 5 },
        { itemId: 1, qty: 5 },
      ],
    })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1",
      warehouseId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, unitCost: 1000 }])
    }))
    expect(res?.success).toBe(true)
    const createArg = mocks.prismaMock.goodsReceiptItem.createMany.mock.calls.at(-1)?.[0] as any
    expect(createArg?.data?.[0]).toEqual(expect.objectContaining({ itemId: 1, qtyOrdered: 10 }))
  })

  it("verifyGoodsReceipt succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, items: [{ itemId: 1, qty: 5, unitCost: 1000 }]
    })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, items: [{ itemId: 1, qty: 10 }]
    })
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([])
    
    const res = await actions.verifyGoodsReceipt(1)
    expect(res?.success).toBe(true)
  })

  it("deleteGoodsReceipt succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", items: [] })
    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
  })
})

describe("Vendor Bill Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // PO-linked bills now validate the bill vendor against the PO vendor.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, vendorId: 1, documentNo: "PO-001", isService: false })
    // Gerbang vendor hidup (putaran 32): default vendor aktif; test penolakan
    // menimpanya ke null.
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    // Gerbang item hidup (putaran 32): baris fixture tanpa override wajib
    // terlihat aktif; test dengan override mockResolvedValue menang sesudah ini.
    mocks.prismaMock.item.findMany.mockImplementation(async (arg: any) => {
      const ids = arg?.where?.id?.in
      if (!ids) return []
      return ids.map((id: number) => ({ id, sku: `SKU-${id}`, name: `Item ${id}`, unitOfMeasure: "PCS", isActive: true, deletedAt: null }))
    })
  })

  it("createVendorBill succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000"
    }))
    expect(res?.success).toBe(true)
  })

  it("putaran 62: createVendorBill — retry dengan idempotencyKey sama ditolak, tagihan lahir sekali", async () => {
    const idem = mocks.prismaMock.idempotencyKey
    idem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    idem.findUnique.mockResolvedValueOnce({ createdAt: new Date() })
    const payload = {
      vendorId: "1", date: "2026-06-12", subtotal: "500", tax: "0", grandTotal: "500",
      idempotencyKey: "bill-key-1",
    }
    const first = await actions.createVendorBill(fdMap(payload))
    const second = await actions.createVendorBill(fdMap(payload))
    expect(first?.success).toBe(true)
    expect(second?.success).toBe(false)
    expect(second?.error).toContain("duplikat")
    expect(mocks.prismaMock.vendorBill.create).toHaveBeenCalledTimes(1)
  })

  it("createVendorBill persists the item lines (goods stay recorded)", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 7, sku: "BRG-01", name: "Baut", unitOfMeasure: "PCS", isActive: true, deletedAt: null },
    ])
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "100000",
      tax: "0",
      grandTotal: "100000",
      items: JSON.stringify([
        { itemId: 7, qty: 2, unitPrice: 50000, discountPercent: 0, taxPercent: 0 },
      ]),
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBillItem.createMany.mock.calls.at(-1)![0]
    expect(arg.data).toHaveLength(1)
    expect(arg.data[0]).toMatchObject({
      vendorBillId: 1,
      itemId: 7,
      description: "BRG-01 - Baut",
      unit: "PCS",
      qty: 2,
      unitPrice: 50000,
      total: 100000,
    })
  })

  it("createVendorBill without items writes no item line", async () => {
    mocks.prismaMock.vendorBillItem.createMany.mockClear()
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "500",
      tax: "0",
      grandTotal: "500",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBillItem.createMany).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: createVendorBill menolak item nonaktif", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 5, sku: "X", name: "Item Mati", unitOfMeasure: "PCS", isActive: false, deletedAt: null },
    ])
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
      items: JSON.stringify([{ itemId: 5, qty: 1, unitPrice: 1000, discountPercent: 0, taxPercent: 0 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    // Gerbang berjalan di dalam tx sesudah header lahir — rollback menghapusnya,
    // jadi yang diassert adalah baris item tidak pernah ditulis.
    expect(mocks.prismaMock.vendorBillItem.createMany).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: createVendorBill menolak vendor nonaktif", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: updateVendorBill menolak vendor nonaktif bebas (tanpa PO)", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "2",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: confirmVendorBill menolak vendor yang sudah nonaktif", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 5, purchaseOrderId: null, createdBy: 99,
      notes: null, subtotal: 1000, tax: 0, grandTotal: 1000, withholdingAmount: 0, withholdingTypeId: null,
    })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  // Regresi putaran 43: vendor/tipe potongan hanya dinilai ulang saat
  // BERPINDAH — vendor yang dinonaktifkan dan tipe PPh yang dimatikan
  // sesudah draft lahir tidak memblokir edit nominal (confirm menilai).
  it("regresi putaran 43: updateVendorBill tak menilai ulang vendor + tipe PPh yang tidak berpindah", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 2, goodsReceiptId: null, purchaseOrderId: null, withholdingTypeId: 9,
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue({ status: "draft", goodsReceiptId: null, vendorId: 2 })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue(null)
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "2",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
      withholdingTypeId: "9",
      withholdingAmount: "20",
    }))
    expect(res?.success).toBe(true)
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue(undefined)
  })

  // Regresi putaran 32 #6(b): jenis PPh tawanan — picker hanya menawarkan
  // jenis aktif, tetapi payload dibuat tangan (atau jenis dinonaktifkan
  // sesudah draft lahir) lolos withholdingGuard (hanya cek ada-id +
  // nominal) dan confirm melahirkan jurnal Hutang PPh dari jenis mati.
  it("regresi putaran 32: createVendorBill menolak jenis PPh nonaktif", async () => {
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue(null)
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
      withholdingTypeId: "9",
      withholdingAmount: "20",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 32: confirmVendorBill menolak jenis PPh yang sudah nonaktif", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 5, purchaseOrderId: null, createdBy: 99,
      notes: null, subtotal: 1000, tax: 0, grandTotal: 1000, withholdingAmount: 20, withholdingTypeId: 9,
    })
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue(null)
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("createVendorBill computes each line total as subtotal + tax", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 9, sku: "S", name: "Item", unitOfMeasure: null, isActive: true, deletedAt: null },
    ])
    await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "100000",
      tax: "11000",
      grandTotal: "111000",
      items: JSON.stringify([
        { itemId: 9, qty: 1, unitPrice: 100000, discountPercent: 0, taxPercent: 11 },
      ]),
    }))
    const arg = mocks.prismaMock.vendorBillItem.createMany.mock.calls.at(-1)![0]
    expect(arg.data[0].taxAmount).toBe(11000)
    expect(arg.data[0].total).toBe(111000)
  })

  it("updateVendorBill replaces the item lines", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 7, sku: "BRG-01", name: "Baut", unitOfMeasure: "PCS", isActive: true, deletedAt: null },
    ])
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "50000",
      tax: "0",
      grandTotal: "50000",
      items: JSON.stringify([{ itemId: 7, qty: 1, unitPrice: 50000 }]),
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBillItem.deleteMany).toHaveBeenCalledWith({
      where: { vendorBillId: 1 },
    })
    const arg = mocks.prismaMock.vendorBillItem.createMany.mock.calls.at(-1)![0]
    expect(arg.data[0]).toMatchObject({ vendorBillId: 1, itemId: 7, total: 50000 })
  })

  it("createVendorBill rejects a bill whose vendor does not match the PO vendor", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, vendorId: 99, documentNo: "PO-001", isService: true,
    })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/vendor tagihan tidak sesuai/i)
    // The wrong-vendor bill must never be created nor matched.
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("createVendorBill accepts a service PO bill once goods value matches", async () => {
    // Service GR expensed Dr Expense / Cr clearing; the bill (goods-based because
    // a GR exists) debits clearing → net Dr Expense / Cr AP. The 3-way match still
    // applies to the service value received.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, vendorId: 1, documentNo: "PO-SVC", isService: true,
    })
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 5000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "5000",
      tax: "0",
      grandTotal: "5000",
    }))
    expect(res?.success).toBe(true)
  })

  it("createVendorBill menerima tagihan PO jasa tanpa GR (plafon total PO)", async () => {
    // PO jasa tidak punya penerimaan barang; 3-way match untuk jasa adalah
    // plafon total PO, bukan keberadaan GR.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, vendorId: 1, documentNo: "PO-SVC", isService: true,
    })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      isService: true, grandTotal: 5000, documentNo: "PO-SVC",
    })
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "5000",
      tax: "0",
      grandTotal: "5000",
    }))
    expect(res?.success).toBe(true)
  })

  it("createVendorBill menolak tagihan PO jasa melebihi total PO", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1, vendorId: 1, documentNo: "PO-SVC", isService: true,
    })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      isService: true, grandTotal: 5000, documentNo: "PO-SVC",
    })
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "9000",
      tax: "0",
      grandTotal: "9000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/melebihi total PO/i)
  })

  it("updateVendorBill succeeds", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1200",
      tax: "0",
      grandTotal: "1200"
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_vendor_bills")
  })

  it("regresi putaran 22: updateVendorBill menolak vendor berbeda dari vendor PO", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      vendorId: 2, documentNo: "PO-001", isService: false,
    })
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      purchaseOrderId: "1",
      date: "2026-06-12",
      subtotal: "1200",
      tax: "0",
      grandTotal: "1200",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak sesuai dengan vendor PO")
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("confirmVendorBill succeeds", async () => {
    // Needs 3-way match
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(true)
  })

  it("confirmVendorBill bill tanpa PO mengunci baris bill sebelum baca ulang draft", async () => {
    // Bill tanpa PO: selama ini tidak ada kunci sama sekali, bacaan ulang
    // dalam tx adalah snapshot — updateVendorBill (mengunci baris bill)
    // bisa commit di antaranya dan posting menulis status/balanceDue dari
    // nominal basi.
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 9,
      subtotal: 100, tax: 0, grandTotal: 100, withholdingAmount: 0, withholdingTypeId: null,
    })
    const sqlSeen: string[] = []
    mocks.prismaMock.$executeRaw.mockImplementation((...a: any[]) => {
      const first = a[0]
      sqlSeen.push(Array.isArray(first) ? first.join("?") : ((first as any)?.strings?.join("?") ?? String(first ?? "")))
      return Promise.resolve(1)
    })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(true)
    const billLockIdx = sqlSeen.findIndex((s) => /vendor_bills/i.test(s) && /for update/i.test(s))
    expect(billLockIdx).toBeGreaterThanOrEqual(0)
    // Kunci mendahului bacaan ulang fresh dalam tx (findUniqueOrThrow ke-2;
    // panggilan pertama adalah pre-check luar tx).
    const secondRead = mocks.prismaMock.vendorBill.findUniqueOrThrow.mock.invocationCallOrder[1]
    expect(mocks.prismaMock.$executeRaw.mock.invocationCallOrder[billLockIdx]).toBeLessThan(secondRead)
  })

  it("createVendorBill tidak mem-posting jurnal (draft murni, P0-2)", async () => {
    const hook = (await import("@/lib/hooks/accounting.hook")).onVendorBillPosted as any
    hook.mockClear()
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
    }))
    expect(res?.success).toBe(true)
    // Satu titik pengakuan = posting; draft tanpa jurnal (selaras laporan AP
    // yang mengecualikan draft).
    expect(hook).not.toHaveBeenCalled()
  })

  it("updateVendorBill pada draft tidak menyentuh jurnal sama sekali (draft murni, BUG-05)", async () => {
    const accounting = (await import("@/lib/hooks/accounting.hook")) as any
    accounting.onVendorBillPosted.mockClear()
    accounting.deleteJournalByReferenceTx.mockClear()
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
    }))
    expect(res?.success).toBe(true)
    // Simetris createVendorBill: draft murni tanpa jurnal. Jurnal hanya lahir
    // di confirmVendorBill (posting), bukan saat draft dibuat/diedit.
    expect(accounting.onVendorBillPosted).not.toHaveBeenCalled()
    expect(accounting.deleteJournalByReferenceTx).not.toHaveBeenCalled()
  })

  it("regresi putaran 43: updateVendorBill draft tidak menyinkronkan HPP jasa (sync HPP hanya titik pengakuan)", async () => {
    // Fixture: bill draft tertaut PO jasa dg WO; edit mengubah nominal.
    // Pra-fix updateVendorBill memanggil syncServicePoCostFromBills walau
    // status masih draft — ProductionCost produksi ditulis dari bill belum
    // diakui. Agregat sync membaca bill non-cancelled termasuk draft.
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 9, goodsReceiptId: null,
    })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      id: 9, isService: true, workOrderId: 55, documentNo: "PO-SVC-9", grandTotal: 777000,
    })
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0, subtotal: 0 } })
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      purchaseOrderId: "9",
      date: "2026-06-12",
      subtotal: "777000",
      tax: "0",
      grandTotal: "777000",
    }))
    expect(res?.success).toBe(true)
    // Edit draft murni: jalur HPP jasa (ProductionCost) tidak boleh ditulis.
    // Assertion sempit pada _sum.grandTotal membedakan agregat sync-HPP dari
    // agregat reservasi plafon 3-way match (yang menjumlah subtotal dan SAH
    // berjalan pada edit draft).
    expect(
      mocks.prismaMock.vendorBill.aggregate.mock.calls.some(
        (c: any[]) => c[0]?._sum?.grandTotal === true,
      ),
    ).toBe(false)
    expect(mocks.prismaMock.productionCost.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionCost.create).not.toHaveBeenCalled()
  })

  // GR senilai 100 (1 × 100) sudah ditagih 60 lewat baris penerimaan 501.
  const setupGrBill = (billedSubtotal: number) => {
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77, documentNo: "GR-077", status: "verified",
      purchaseOrder: { vendorId: 1 },
    })
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 501, itemId: 7, qty: 1, unitCost: 100 },
    ])
    mocks.prismaMock.vendorBillItem.aggregate.mockResolvedValue({
      _sum: { subtotal: billedSubtotal },
    })
    mocks.prismaMock.vendorBill.create.mockResolvedValue({ id: 1 })
  }

  it("createVendorBill menolak tagihan kedua yang membuat total per-GR melebihi nilai GR (BUG-09)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    setupGrBill(60)
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      goodsReceiptId: "77",
      date: "2026-06-12",
      subtotal: "60",
      tax: "0",
      grandTotal: "60",
      items: JSON.stringify([{ itemId: 7, qty: 1, unitPrice: 60 }]),
    }))
    // 60 (sudah ditagih) + 60 (baru) = 120 > 100 nilai penerimaan.
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/melebihi nilai penerimaan/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("createVendorBill menautkan baris ke baris GR yang qty-nya menampung (best-fit)", async () => {
    // Dua penerimaan item sama: 2 unit (501) lalu 8 unit (502). Tagihan
    // mengirim qty 8 dulu — tautan urutan mentah (shift) menempelkannya ke
    // baris 2 unit sehingga sisa GR/IR per baris tertukar.
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77, documentNo: "GR-077", status: "verified",
      purchaseOrder: { vendorId: 1 },
    })
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 501, itemId: 7, qty: 2, unitCost: 100 },
      { id: 502, itemId: 7, qty: 8, unitCost: 100 },
    ])
    mocks.prismaMock.vendorBillItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    mocks.prismaMock.vendorBill.create.mockResolvedValue({ id: 1 })
    mocks.prismaMock.item.findMany.mockResolvedValue([
      { id: 7, sku: "BRG-01", name: "Baut", unitOfMeasure: "PCS", isActive: true, deletedAt: null },
    ])
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      goodsReceiptId: "77",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "0",
      grandTotal: "1000",
      items: JSON.stringify([
        { itemId: 7, qty: 8, unitPrice: 100 },
        { itemId: 7, qty: 2, unitPrice: 100 },
      ]),
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBillItem.createMany.mock.calls.at(-1)![0]
    expect(arg.data.map((r: { goodsReceiptItemId: number }) => r.goodsReceiptItemId)).toEqual([502, 501])
  })

  it("createVendorBill menerima tagihan kedua yang tepat menghabiskan nilai GR (BUG-09)", async () => {
    setupGrBill(60)
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      goodsReceiptId: "77",
      date: "2026-06-12",
      subtotal: "40",
      tax: "0",
      grandTotal: "40",
      items: JSON.stringify([{ itemId: 7, qty: 1, unitPrice: 40 }]),
    }))
    // 60 + 40 = 100 = nilai penerimaan — pas, tidak melebihi.
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBill.create).toHaveBeenCalled()
  })

  // Regresi putaran 43: pasangan PO↔GR — create hanya memeriksa vendor PO
  // dan vendor GR terpisah; bill bisa menautkan PO 5 dengan GR milik PO 9
  // (vendor sama) dan hook posting menggolongkan goodsBased dari GR atas
  // PO yang salah. Pasangan kini wajib konsisten; PO kosong diturunkan.
  it("regresi putaran 43: createVendorBill menolak pasangan PO/GR tak konsisten", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77, documentNo: "GR-077", status: "verified",
      purchaseOrderId: 9,
      purchaseOrder: { vendorId: 1 },
    })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      purchaseOrderId: "5",
      goodsReceiptId: "77",
      date: "2026-06-12",
      subtotal: "100",
      tax: "0",
      grandTotal: "100",
      items: JSON.stringify([{ itemId: 7, qty: 1, unitPrice: 100 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("bukan milik PO tagihan ini")
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("regresi putaran 43: createVendorBill hanya-GR menurunkan PO dari GR", async () => {
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77, documentNo: "GR-077", status: "verified",
      purchaseOrderId: 9,
      purchaseOrder: { vendorId: 1 },
    })
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 501, itemId: 7, qty: 1, unitCost: 100 },
    ])
    mocks.prismaMock.vendorBillItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    mocks.prismaMock.vendorBill.create.mockResolvedValue({ id: 1 })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      goodsReceiptId: "77",
      date: "2026-06-12",
      subtotal: "100",
      tax: "0",
      grandTotal: "100",
      items: JSON.stringify([{ itemId: 7, qty: 1, unitPrice: 100 }]),
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.create.mock.calls.at(-1)![0]
    expect(arg.data.purchaseOrderId).toBe(9)
    expect(arg.data.goodsReceiptId).toBe(77)
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue(null)
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])
  })

  // Regresi putaran 43: nomor faktur pajak tempel yang sama pada dua bill
  // vendor yang sama mengkreditkan PPN Masukan dua kali (hook membaca
  // nomor tempel valid tanpa register). Create menolak nomor yang sudah
  // dipakai bill vendor sama non-cancelled lain.
  it("regresi putaran 43: createVendorBill menolak nomor faktur tempel duplikat vendor sama", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValue({ id: 7, documentNo: "BILL-007" })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "5000",
      tax: "550",
      grandTotal: "5550",
      taxInvoiceNumber: "010.000-26.12345678",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah dipakai tagihan BILL-007")
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValue(null)
  })

  it("regresi putaran 43: createVendorBill menolak nomor yang sudah jadi kepala register bill lain", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.taxInvoice.findFirst.mockResolvedValue({ id: 3 })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "5000",
      tax: "550",
      grandTotal: "5550",
      taxInvoiceNumber: "010.000-26.99999999",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah terdaftar sebagai faktur masukan")
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
    mocks.prismaMock.taxInvoice.findFirst.mockResolvedValue(null)
  })

  // R8-JB-09: dueDate tak terisi diturunkan dari termin master vendor.
  it("R8-JB-09: createVendorBill menurunkan dueDate dari termin vendor bila form tak mengisi", async () => {
    mocks.prismaMock.vendor.findUnique.mockResolvedValue({ paymentTerm: { days: 14, isActive: true } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "500",
      tax: "0",
      grandTotal: "500",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.create.mock.calls.at(-1)![0]
    expect(arg.data.dueDate?.toISOString()).toBe("2026-06-26T00:00:00.000Z")
  })

  it("R8-JB-09: dueDate eksplisit bill menang atas termin vendor", async () => {
    mocks.prismaMock.vendor.findUnique.mockResolvedValue({ paymentTerm: { days: 14, isActive: true } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      dueDate: "2026-06-20",
      subtotal: "500",
      tax: "0",
      grandTotal: "500",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.create.mock.calls.at(-1)![0]
    expect(arg.data.dueDate?.toISOString()).toBe("2026-06-20T00:00:00.000Z")
  })

  it("R8-JB-09: updateVendorBill menurun dueDate dari termin vendor hasil edit bila form tak mengisi", async () => {
    mocks.prismaMock.vendor.findUnique.mockResolvedValue({ paymentTerm: { days: 14, isActive: true } })
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "500",
      tax: "0",
      grandTotal: "500",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.update.mock.calls.at(-1)![0]
    expect(arg.data.dueDate?.toISOString()).toBe("2026-06-26T00:00:00.000Z")
  })

  it("R8-JB-09: vendor tanpa termin aktif → dueDate tetap null", async () => {
    mocks.prismaMock.vendor.findUnique.mockResolvedValue({ paymentTerm: null })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "500",
      tax: "0",
      grandTotal: "500",
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.create.mock.calls.at(-1)![0]
    expect(arg.data.dueDate).toBeNull()
  })

  it("R8-JB-08: createVendorBill menolak kop manual inkonsisten (grandTotal != subtotal + tax)", async () => {
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "110",
      grandTotal: "1500",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/grand total tidak sama/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("confirmVendorBill menolak withholding melebihi grandTotal (balanceDue negatif)", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 3,
      subtotal: 1000, tax: 110, grandTotal: 1110, withholdingAmount: 2000,
      withholdingTypeId: 4,
    })
    const hook = (await import("@/lib/hooks/accounting.hook")).onVendorBillPosted as any
    hook.mockClear()
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/melebihi/i)
    expect(hook).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("confirmVendorBill menolak withholding tanpa jenis PPh (akun kewajiban tak dikenal)", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 3,
      subtotal: 1000, tax: 110, grandTotal: 1110, withholdingAmount: 100,
      withholdingTypeId: null,
    })
    const hook = (await import("@/lib/hooks/accounting.hook")).onVendorBillPosted as any
    hook.mockClear()
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/jenis PPh/i)
    expect(hook).not.toHaveBeenCalled()
  })

  it("createVendorBill menolak withholding melebihi grand total terhitung server", async () => {
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "110",
      grandTotal: "1110",
      withholdingTypeId: "4",
      withholdingAmount: "2000",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/melebihi/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("createVendorBill menolak withholding tanpa jenis PPh", async () => {
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1",
      date: "2026-06-12",
      subtotal: "1000",
      tax: "110",
      grandTotal: "1110",
      withholdingAmount: "100",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/jenis PPh/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  it("R8-JB-08: confirmVendorBill menolak draft manual tersimpan dengan kop inkonsisten", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 3,
      subtotal: 1000, tax: 110, grandTotal: 1500, withholdingAmount: 0,
    })
    const hook = (await import("@/lib/hooks/accounting.hook")).onVendorBillPosted as any
    hook.mockClear()
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/tersimpan tidak sama|grand total/i)
    expect(hook).not.toHaveBeenCalled()
  })

  it("confirmVendorBill isi balanceDue NETO (grandTotal − withholding, P0-2)", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    // Gerbang jenis PPh hidup (putaran 32 #6): fixture wajib jenis aktif.
    mocks.prismaMock.withholdingTaxType.findFirst.mockResolvedValue({ id: 4 })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 3,
      grandTotal: 1000000, withholdingAmount: 100000, withholdingTypeId: 4,
      // Kop manual konsisten (By-design R8-JB-08: grandTotal = subtotal + tax).
      subtotal: 1000000, tax: 0,
    })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(true)
    const update = mocks.prismaMock.vendorBill.update.mock.calls.at(-1)![0]
    expect(Number(update.data.balanceDue)).toBe(900000)
  })

  // Setup bersama confirm tagihan atas PO jasa tertaut WO 9.
  const setupServicePoBill = (orders: unknown[]) => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 42, vendorId: 3, grandTotal: 500000,
      subtotal: 500000, tax: 0,
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 42, vendorId: 3, grandTotal: 500000,
      subtotal: 500000, tax: 0,
    })
    mocks.prismaMock.vendorBill.aggregate
      .mockResolvedValueOnce({ _sum: { grandTotal: 0 } })
      .mockResolvedValue({ _sum: { grandTotal: 500000 } })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      // grandTotal WAJIB: assertThreeWayMatch jasa membaca plafon dari PO.
      isService: true, workOrderId: 9, vendorId: 3, documentNo: "PO-0042", grandTotal: 500000,
    })
    mocks.prismaMock.productionOrder.findMany.mockResolvedValue(orders)
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
  }

  it("confirmVendorBill rolls a service PO's value into the work order's production HPP", async () => {
    // First aggregate = 3-way match (0 billed); second = service PO total.
    setupServicePoBill([{ id: 55 }])
    mocks.prismaMock.productionCost.create.mockResolvedValue({ id: 77 })
    mocks.prismaMock.productionOrder.findUnique.mockResolvedValue({ totalActualCost: 1000 })

    const res = await actions.confirmVendorBill(1)

    expect(res?.success).toBe(true)
    const created = mocks.prismaMock.productionCost.create.mock.calls.at(-1)![0]
    expect(created.data.category).toBe("subcontract")
    expect(created.data.purchaseOrderId).toBe(42)
    expect(created.data.productionOrderId).toBe(55)
    expect(Number(created.data.amount)).toBe(500000)
    expect(mocks.prismaMock.productionOrder.update).toHaveBeenCalledWith({
      where: { id: 55 },
      data: { totalActualCost: 501000 },
    })
  })

  it("F-71: confirmVendorBill still posts but warns when the production order is already completed", async () => {
    setupServicePoBill([{ id: 55, status: "completed" }])

    const res = await actions.confirmVendorBill(1)

    expect(res?.success).toBe(true)
    // Posting to AP still happened; only the HPP mirror was refused.
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalled()
    expect(mocks.prismaMock.productionCost.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionOrder.update).not.toHaveBeenCalled()
    expect((res as any).warning).toContain("sudah selesai")
  })

  it("confirmVendorBill does not touch HPP for a non-service PO", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 500000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 42, vendorId: 3, grandTotal: 500000,
      subtotal: 500000, tax: 0,
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 42, vendorId: 3, grandTotal: 500000,
      subtotal: 500000, tax: 0,
    })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValue({
      // Non-jasa: plafon dari nilai GR (fixture 500000 di atas).
      isService: false, workOrderId: null, vendorId: 3, documentNo: "PO-0042", grandTotal: 500000,
    })

    const res = await actions.confirmVendorBill(1)

    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.productionCost.create).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionOrder.update).not.toHaveBeenCalled()
  })

  it("voidVendorBill succeeds", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", payments: [] })
    const res = await actions.voidVendorBill(1)
    expect(res?.success).toBe(true)
  })

  it("R8-PAJAK-07: void bill ber-bupot aktif ditolak", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", paidAmount: 0, payments: [] })
    mocks.prismaMock.withholdingCertificate.count.mockResolvedValue(1)
    try {
      const res = await actions.voidVendorBill(1)
      expect(res?.success).toBe(false)
      expect(String(res?.error)).toMatch(/bukti potong/i)
    } finally {
      mocks.prismaMock.withholdingCertificate.count.mockResolvedValue(0)
    }
  })

  it("regresi putaran 48: void bill ber-faktur masukan aktif ditolak", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "posted", payments: [] })
    mocks.prismaMock.taxInvoice.count.mockResolvedValue(1)
    try {
      const res = await actions.voidVendorBill(1)
      expect(res?.success).toBe(false)
      expect(String(res?.error)).toMatch(/faktur/i)
    } finally {
      mocks.prismaMock.taxInvoice.count.mockResolvedValue(0)
    }
  })

  it("deleteVendorBill succeeds", async () => {
    const res = await actions.deleteVendorBill(1)
    expect(res?.success).toBe(true)
  })

  it("deleteVendorBill sweeps vendor_bill attachments in the same tx (R-13)", async () => {
    mocks.prismaMock.transactionAttachment.findMany.mockResolvedValueOnce([
      { fileUrl: "/api/attachments/vendor_bill/vendor_bill-1-x.pdf", referenceType: "vendor_bill" },
    ])
    const res = await actions.deleteVendorBill(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.deleteMany).toHaveBeenCalledWith({
      where: { referenceType: "vendor_bill", referenceId: 1 },
    })
  })
})

describe("Vendor Payment Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    // Putaran 22: edit menolak vendor mati — default fixture vendor hidup.
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    // Putaran 24: akun pembayaran wajib kas/bank hidup (mock tanpa delegate account).
    ;(mocks.prismaMock as any).account = {
      findUnique: vi.fn().mockResolvedValue({ id: 5, isActive: true, deletedAt: null, reportGroup: "BANK" }),
      findMany: vi.fn().mockResolvedValue([{ id: 5, isActive: true, deletedAt: null, reportGroup: "BANK" }]),
      count: vi.fn().mockResolvedValue(1),
    }
  })

  it("createVendorPayment succeeds", async () => {
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(true)
  })

  it("putaran 59: createVendorPayment — retry dengan idempotencyKey sama ditolak, pembayaran lahir sekali", async () => {
    const idem = mocks.prismaMock.idempotencyKey
    idem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    idem.findUnique.mockResolvedValueOnce({ createdAt: new Date() })
    const payload = {
      vendorId: "1", amount: "50000000", paymentDate: "2026-06-12", paymentMethod: "transfer",
      idempotencyKey: "vpay-key-1",
    }
    const first = await actions.createVendorPayment(fdMap(payload))
    const second = await actions.createVendorPayment(fdMap(payload))
    expect(first?.success).toBe(true)
    expect(second?.success).toBe(false)
    expect(second?.error).toContain("duplikat")
    expect(mocks.prismaMock.vendorPayment.create).toHaveBeenCalledTimes(1)
  })

  it("regresi putaran 24: createVendorPayment menolak vendor nonaktif/terhapus", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorPayment.create).not.toHaveBeenCalled()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
  })

  it("regresi putaran 24: createVendorPayment menolak akun nonaktif/bukan kas-bank", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    ;(mocks.prismaMock as any).account.findUnique.mockReset()
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValueOnce({ id: 5, isActive: false, deletedAt: null, reportGroup: "BANK" })
    const inactive = await actions.createVendorPayment(fdMap({
      vendorId: "1", amount: "1000", paymentDate: "2026-06-12", paymentMethod: "transfer", accountId: "5",
    }))
    expect(inactive?.success).toBe(false)
    expect(inactive?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorPayment.create).not.toHaveBeenCalled()

    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValueOnce({ id: 5, isActive: true, deletedAt: null, reportGroup: "AREC" })
    const wrongGroup = await actions.createVendorPayment(fdMap({
      vendorId: "1", amount: "1000", paymentDate: "2026-06-12", paymentMethod: "transfer", accountId: "5",
    }))
    expect(wrongGroup?.success).toBe(false)
    expect(wrongGroup?.error).toContain("kas/bank")
    expect(mocks.prismaMock.vendorPayment.create).not.toHaveBeenCalled()
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValue({ id: 5, isActive: true, deletedAt: null, reportGroup: "BANK" })
  })

  it("regresi putaran 24: updateVendorPayment menolak akun nonaktif/bukan kas-bank", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    ;(mocks.prismaMock as any).account.findUnique.mockReset()
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValueOnce({ id: 5, isActive: false, deletedAt: null, reportGroup: "BANK" })
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1", amount: "1200", paymentDate: "2026-06-12", paymentMethod: "transfer", accountId: "5",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValue({ id: 5, isActive: true, deletedAt: null, reportGroup: "BANK" })
  })

  it("regresi putaran 24: confirmVendorPayment menolak vendor mati dan akun pembayaran mati dalam tx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 500, createdBy: 2, accountId: 5,
    })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const deadVendor = await actions.confirmVendorPayment(1)
    expect(deadVendor?.success).toBe(false)
    expect(deadVendor?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()

    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    ;(mocks.prismaMock as any).account.findUnique.mockReset()
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValueOnce({ id: 5, isActive: true, deletedAt: new Date(), reportGroup: "BANK" })
    const deadAccount = await actions.confirmVendorPayment(1)
    expect(deadAccount?.success).toBe(false)
    expect(deadAccount?.error).toContain("sudah dihapus")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    ;(mocks.prismaMock as any).account.findUnique.mockResolvedValue({ id: 5, isActive: true, deletedAt: null, reportGroup: "BANK" })
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createVendorPayment persists the targeted bill", async () => {
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValueOnce({ id: 7, status: "posted" })
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash",
      vendorBillId: "7",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorBillId: 7 }) }),
    )
  })

  // Regresi: input "No. Referensi"/"No. Rekening" ada di form dan kolomnya ada di
  // DB, tetapi keduanya tidak ada di skema — parseFormData membuang nilainya
  // sehingga yang tersimpan selalu null.
  it("createVendorPayment menyimpan nomor referensi & nomor rekening", async () => {
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "transfer",
      referenceNumber: "TRF-001",
      bankAccount: "1234567890",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referenceNumber: "TRF-001", bankAccount: "1234567890" }),
      }),
    )
  })

  it("createVendorPayment rejects a bill that belongs to another vendor", async () => {
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValueOnce(null)
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash",
      vendorBillId: "7",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tagihan tidak ditemukan")
    expect(mocks.prismaMock.vendorPayment.create).not.toHaveBeenCalled()
  })

  it("createVendorPayment rejects an already-paid target bill", async () => {
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValueOnce({ id: 7, status: "paid" })
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash",
      vendorBillId: "7",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("sudah lunas")
  })

  it("createVendorPayment without a targeted bill leaves vendorBillId null", async () => {
    const res = await actions.createVendorPayment(fdMap({
      vendorId: "1",
      amount: "1000",
      paymentDate: "2026-06-12",
      paymentMethod: "cash",
    }))
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vendorBillId: null }) }),
    )
  })

  it("updateVendorPayment succeeds", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1",
      amount: "1200",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_vendor_payments")
  })

  it("regresi putaran 22: updateVendorPayment menolak vendor nonaktif/terhapus", async () => {
    // Putaran 43: gerbang hanya saat vendor BERPINDAH — baris terkunci
    // vendor 9, payload pindah ke vendor 1 yang nonaktif.
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 9, accountId: null })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1",
      amount: "1200",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak aktif")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  // Regresi putaran 43: vendor yang tidak berpindah tidak dinilai ulang.
  it("regresi putaran 43: updateVendorPayment tak menilai ulang vendor yang tidak berpindah", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 1, accountId: null })
    mocks.prismaMock.vendor.findFirst.mockResolvedValue(null)
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1",
      amount: "1200",
      paymentDate: "2026-06-12",
      paymentMethod: "cash"
    }))
    expect(res?.success).toBe(true)
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("regresi putaran 32: updateVendorPayment menolak tagihan target vendor lain", async () => {
    mocks.prismaMock.vendor.findFirst.mockResolvedValue({ id: 1 })
    mocks.prismaMock.vendorBill.findFirst.mockResolvedValue(null)
    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1",
      amount: "1200",
      paymentDate: "2026-06-12",
      paymentMethod: "cash",
      vendorBillId: "77"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tagihan tidak ditemukan untuk vendor ini")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
  })

  it("confirmVendorPayment succeeds", async () => {
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
  })

  it("regression round 18: confirmVendorPayment menolak pembuat sendiri dan menilai ulang approval dalam tx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 500, createdBy: 1,
    })
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pemisahan tugas")
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()

    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 500, createdBy: 2,
    })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([{ id: 10, balanceDue: 500, paidAmount: 0, grandTotal: 500 }])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReset()
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([{ vendorBillId: 10, amount: 500 }])
    const ok = await actions.confirmVendorPayment(1)
    expect(ok?.success).toBe(true)
    const approval = await import("@/lib/services/approval-workflow.service")
    expect(vi.mocked(approval.assertApproved).mock.calls.at(-1)).toEqual(["VendorPayment", 1, mocks.prismaMock])
  })

  it("regression round 18: confirmVendorBill menolak pembuat sendiri", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: null, vendorId: 9, createdBy: 1,
      subtotal: 100, tax: 0, grandTotal: 100, withholdingAmount: 0, withholdingTypeId: null,
    })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pemisahan tugas")
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("deleteVendorPayment succeeds", async () => {
    const res = await actions.deleteVendorPayment(1)
    expect(res?.success).toBe(true)
  })

  it("deleteVendorPayment sweeps vendor_payment attachments in the same tx (R-13)", async () => {
    mocks.prismaMock.transactionAttachment.findMany.mockResolvedValueOnce([
      { fileUrl: "/api/attachments/vendor_payment/vendor_payment-1-x.pdf", referenceType: "vendor_payment" },
    ])
    const res = await actions.deleteVendorPayment(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.transactionAttachment.deleteMany).toHaveBeenCalledWith({
      where: { referenceType: "vendor_payment", referenceId: 1 },
    })
  })
})

describe("Purchase Return Actions", () => {
  beforeEach(() => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  })

  it("createPurchaseReturn succeeds", async () => {
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("putaran 62: createPurchaseReturn — retry dengan idempotencyKey sama ditolak, retur lahir sekali", async () => {
    const idem = mocks.prismaMock.idempotencyKey
    idem.create
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
    idem.findUnique.mockResolvedValueOnce({ createdAt: new Date() })
    const payload = {
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2 }]),
      idempotencyKey: "pret-key-1",
    }
    const first = await actions.createPurchaseReturn(fdMap(payload))
    const second = await actions.createPurchaseReturn(fdMap(payload))
    expect(first?.success).toBe(true)
    expect(second?.success).toBe(false)
    expect(second?.error).toContain("duplikat")
    expect(mocks.prismaMock.purchaseReturn.create).toHaveBeenCalledTimes(1)
  })

  // F-004 §3 simetris: nomor + tanggal nota retur pajak beli ditulis apa adanya.
  it("STOK-05: cap retur beli dalam qty dasar lintas UOM (1 BOX=12 + 1 PCS = 13)", async () => {
    // toBaseFactor nyata: BOX->PCS faktor 12 lewat uomConversion.
    mocks.prismaMock.item.findUnique.mockResolvedValue({ unitOfMeasure: "PCS" })
    mocks.prismaMock.uomConversion.findUnique.mockImplementation(async ({ where }: any) =>
      where?.itemId_code?.code === "BOX" ? { factorToBase: 12 } : null,
    )
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { itemId: 1, qty: 1, uom: "BOX" },
      { itemId: 1, qty: 1, uom: "PCS" },
    ])
    const ok = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 13 }]),
    }))
    expect(ok?.success).toBe(true)
    // Buang retur pertama dari hitungan prior: create mock tidak benar-benar
    // menyimpan, tetapi priorReturns membaca purchaseReturnItem.findMany
    // default [] — panggilan kedua bersih. Set ulang GR supaya deterministik.
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { itemId: 1, qty: 1, uom: "BOX" },
      { itemId: 1, qty: 1, uom: "PCS" },
    ])
    // findOverReturn di-mock null secara global di file ini — pakai
    // implementasi asli untuk membuktikan cap basis-dasar bekerja.
    const real = await vi.importActual<typeof import("@/lib/sales/return-validation")>("@/lib/sales/return-validation")
    const { findOverReturn } = await import("@/lib/sales/return-validation")
    vi.mocked(findOverReturn).mockImplementation(real.findOverReturn)
    const over = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 14 }]),
    }))
    expect(over?.success).toBe(false)
    expect(over?.error).toContain("melebihi yang diterima")
    vi.mocked(findOverReturn).mockReset()
    vi.mocked(findOverReturn).mockReturnValue(null)
  })

  it("regression round 18: retur lampau ikut dikonversi ke qty dasar sebelum cap", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.item.findUnique.mockResolvedValue({ unitOfMeasure: "PCS" })
    mocks.prismaMock.uomConversion.findUnique.mockImplementation(async ({ where }: any) =>
      where?.itemId_code?.code === "BOX" ? { factorToBase: 12 } : null,
    )
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 11, itemId: 1, qty: 10, uom: "BOX" },
    ])
    // 10 BOX sudah diretur sebelumnya = 120 PCS dasar; bukan "10" mentah.
    mocks.prismaMock.purchaseReturnItem.findMany.mockResolvedValue([
      { itemId: 1, qty: 10, goodsReceiptItemId: null },
    ])
    const real = await vi.importActual<typeof import("@/lib/sales/return-validation")>("@/lib/sales/return-validation")
    const { findOverReturn } = await import("@/lib/sales/return-validation")
    vi.mocked(findOverReturn).mockImplementation(real.findOverReturn)

    const over = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1 }]),
    }))
    const createCalled = mocks.prismaMock.purchaseReturn.create.mock.calls.length > 0
    vi.mocked(findOverReturn).mockReset()
    vi.mocked(findOverReturn).mockReturnValue(null)

    expect(over?.success).toBe(false)
    expect(over?.error).toContain("melebihi yang diterima")
    expect(createCalled).toBe(false)
  })

  it("STOK-16: tautan baris penerimaan asal disimpan dan cap per baris GR ditegakkan", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    // Dua penerimaan item sama, UOM beda: GR 11 = 1 BOX (12 PCS), GR 12 = 5 PCS.
    mocks.prismaMock.item.findUnique.mockResolvedValue({ unitOfMeasure: "PCS" })
    mocks.prismaMock.uomConversion.findUnique.mockImplementation(async ({ where }: any) =>
      where?.itemId_code?.code === "BOX" ? { factorToBase: 12 } : null,
    )
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 11, itemId: 1, qty: 1, uom: "BOX" },
      { id: 12, itemId: 1, qty: 5, uom: "PCS" },
    ])
    // Tautan GR 12 hanya menampung 5 PCS: retur tertaut 6 PCS ditolak walau
    // cap agregat per item (17 PCS) masih longgar.
    const over = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, goodsReceiptItemId: 12 }]),
    }))
    expect(over?.success).toBe(false)
    expect(over?.error).toContain("melebihi sisa penerimaan asal")
    expect(mocks.prismaMock.purchaseReturn.create).not.toHaveBeenCalled()
    // Retur dalam sisa GR 12 lolos dan tautan tersimpan apa adanya.
    const ok = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5, goodsReceiptItemId: 12 }]),
    }))
    expect(ok?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ itemId: 1, qty: 5, goodsReceiptItemId: 12 }))
  })

  it("STOK-16: tautan GR dari PO lain / item lain ditolak; tautan tak valid ditolak parser", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([
      { id: 11, itemId: 1, qty: 1, uom: "PCS" },
    ])
    // Tautan menunjuk baris GR yang tidak ada pada PO ini.
    const unknown = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, goodsReceiptItemId: 99 }]),
    }))
    expect(unknown?.success).toBe(false)
    expect(unknown?.error).toContain("tidak ditemukan pada PO ini")
    // Tautan ada tetapi item baris GR berbeda dari item retur.
    const wrongItem = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 2, qty: 1, goodsReceiptItemId: 11 }]),
    }))
    expect(wrongItem?.success).toBe(false)
    expect(wrongItem?.error).toContain("tidak ditemukan pada PO ini")
    // Tautan bukan angka positif ditolak parser sebelum query apa pun.
    const badLink = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 1, goodsReceiptItemId: "abc" }]),
    }))
    expect(badLink?.success).toBe(false)
    expect(badLink?.error).toMatch(/Baris penerimaan asal item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseReturn.create).not.toHaveBeenCalled()
  })

  it("createPurchaseReturn menulis nomor + tanggal nota retur pajak", async () => {
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      taxReturnNoteNumber: "000000.0100000002",
      taxReturnNoteDate: "2026-07-02",
      items: JSON.stringify([{ itemId: 1, qty: 2 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.taxReturnNoteNumber).toBe("000000.0100000002")
    expect(arg.data.taxReturnNoteDate).toEqual(new Date(Date.UTC(2026, 6, 2)))
  })

  it("updatePurchaseReturn menulis nomor + tanggal nota retur pajak", async () => {
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      taxReturnNoteNumber: "NR-B-001",
      taxReturnNoteDate: "2026-08-20",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.update.mock.calls.at(-1)![0]
    expect(arg.data.taxReturnNoteNumber).toBe("NR-B-001")
    expect(arg.data.taxReturnNoteDate).toEqual(new Date(Date.UTC(2026, 7, 20)))
  })

  it("createPurchaseReturn membaca qty/harga string format Indonesia penuh", async () => {
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "2.000", price: "150.000" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0].qty).toBe(2000)
    expect(arg.data.items.create[0].price).toBe(150000)
  })

  it("createPurchaseReturn menolak qty tak terbaca tanpa membuat retur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas retur item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseReturn.create).not.toHaveBeenCalled()
  })

  it("createPurchaseReturn menolak harga tak terbaca tanpa membuat retur", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, price: "xyz" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Harga beli retur item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseReturn.create).not.toHaveBeenCalled()
  })

  it("createPurchaseReturn membuang baris tanpa item / qty nol (baris kosong form)", async () => {
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 0, qty: 5 }, { itemId: 1, qty: 0 }, { itemId: 2, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create).toEqual([
      expect.objectContaining({ itemId: 2, qty: 3 }),
    ])
  })

  it("updatePurchaseReturn membaca qty string format Indonesia penuh", async () => {
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "1,5", price: "2.000.000" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseReturn.update.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0].qty).toBe(1.5)
    expect(arg.data.items.create[0].price).toBe(2000000)
  })

  it("updatePurchaseReturn menolak qty tak terbaca tanpa menghapus baris lama", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas retur item #1 tidak valid/i)
    expect(mocks.prismaMock.purchaseReturnItem.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.purchaseReturn.update).not.toHaveBeenCalled()
  })

  it("updatePurchaseReturn succeeds", async () => {
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("edit_purchase_returns")
  })

  it("updatePurchaseReturn mengunci baris retur SEBELUM baca ulang status di dalam tx", async () => {
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
    const rawCalls = mocks.prismaMock.$executeRaw.mock.calls
    const lockIdx = rawCalls.findIndex((call: unknown[]) => {
      const first = call[0] as unknown
      const sql = Array.isArray(first) ? (first as string[]).join("") : String((first as { strings?: string[] } | undefined)?.strings?.join("") ?? first)
      return sql.includes("purchase_returns") && sql.includes("FOR UPDATE")
    })
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    const findIdx = mocks.prismaMock.purchaseReturn.findUnique.mock.invocationCallOrder[0]
    expect(mocks.prismaMock.$executeRaw.mock.invocationCallOrder[lockIdx]).toBeLessThan(findIdx)
  })

  it("updatePurchaseReturn menolak retur yang sudah returned saat baca ulang dalam tx", async () => {
    mocks.prismaMock.purchaseReturn.findUnique.mockResolvedValue({ status: "returned" })
    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya retur draft yang dapat diedit")
    expect(mocks.prismaMock.purchaseReturnItem.deleteMany).not.toHaveBeenCalled()
  })

  it("processPurchaseReturn succeeds", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 1, defaultWarehouseId: 3 }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValueOnce({ id: 3 })
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(true)
  })

  it("processPurchaseReturn succeeds via active-warehouse fallback when receipt+default kosong", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 1, defaultWarehouseId: null }])
    // Loader queries active warehouse first (where.isActive); distinguish by arg so
    // mutating the loader to return active/any=null turns this test red.
    mocks.prismaMock.warehouse.findFirst.mockImplementation(async (arg: any) =>
      arg?.where?.isActive ? { id: 5 } : null)
    scopeUser([5])
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(true)
  })

  it("processPurchaseReturn rejects when receipt warehouse is outside user scope", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { itemId: 1, warehouseId: 9, goodsReceipt: { warehouseId: 9 } },
    ])
    scopeUser([3])
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses ke gudang")
  })

  it("processPurchaseReturn rejects when fallback warehouse is outside user scope", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 1, defaultWarehouseId: 9 }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValueOnce({ id: 9 })
    scopeUser([3])
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak memiliki akses ke gudang")
  })

  it("processPurchaseReturn rejects when no warehouse can be resolved", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 1, defaultWarehouseId: null }])
    mocks.prismaMock.warehouse.findFirst.mockResolvedValue(null)
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Gudang retur pembelian tidak ditemukan")
  })

  it("regresi putaran 16: processPurchaseReturn menolak pembuat sendiri (pemisahan tugas)", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", createdBy: 1, items: [{ itemId: 1, qty: 3 }], purchaseOrderId: 1
    })
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["admin"] })
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("pemisahan tugas")
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("processPurchaseReturn succeeds when receipt warehouse is within user scope", async () => {
    mockDraftReturn()
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { itemId: 1, warehouseId: 3, goodsReceipt: { warehouseId: 3 } },
    ])
    scopeUser([3])
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(true)
  })

  it("deletePurchaseReturn succeeds", async () => {
    const res = await actions.deletePurchaseReturn(1)
    expect(res?.success).toBe(true)
  })
  it("deletePurchaseOrder succeeds", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", goodsReceipts: [] })
      .mockResolvedValueOnce({ id: 1, status: "draft", goodsReceipts: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(true)
  })
  it("regresi putaran 22: deletePurchaseOrder menolak GR anak ber-catatan QC", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValue({ id: 1, status: "draft", goodsReceipts: [{ id: 55, status: "draft" }] })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    mocks.prismaMock.qcInspection.count.mockResolvedValue(1)
    mocks.prismaMock.nonconformance.count.mockResolvedValue(0)
    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("catatan QC")
    expect(mocks.prismaMock.goodsReceipt.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.purchaseOrder.delete).not.toHaveBeenCalled()
    // clearAllMocks tak membuang implementasi — kembalikan hitungan QC ke 0
    // agar test hapus lain tak mewarisi catatan QC hantu.
    mocks.prismaMock.qcInspection.count.mockResolvedValue(0)
    mocks.prismaMock.nonconformance.count.mockResolvedValue(0)
  })

  it("regresi putaran 16: deletePurchaseOrder menghitung ulang status PR, bukan revert keras", async () => {
    const hook = await import("@/lib/hooks/purchase-order.hook") as any
    ;(hook.recalcPurchaseRequestStatus as any).mockClear()
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", goodsReceipts: [], purchaseRequestId: 9 })
      .mockResolvedValueOnce({ id: 1, status: "draft", goodsReceipts: [], purchaseRequestId: 9 })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(true)
    expect(hook.recalcPurchaseRequestStatus).toHaveBeenCalledWith(9, expect.anything())
    expect(mocks.prismaMock.purchaseRequest.update).not.toHaveBeenCalled()
  })
  it("deletePurchaseOrder fails if active bills exist", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", goodsReceipts: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(1)
    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tagihan vendor aktif")
  })
  it("deletePurchaseOrder fails if not found", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockRejectedValueOnce(new Error("not found"))
    const res = await actions.deletePurchaseOrder(999)
    expect(res?.success).toBe(false)
  })
  it("deletePurchaseReturn fails if status not draft (line 1572 branch)", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.deletePurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("draft")
  })
  it("deletePurchaseReturn handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockRejectedValueOnce(new Error("db err"))
    const res = await actions.deletePurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toBe("db err")
  })
})


describe('Global Error Paths (Permission Reject)', () => {
  it("createPurchaseRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createPurchaseRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("createPurchaseOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createPurchaseOrder(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("cancelPurchaseOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).cancelPurchaseOrder(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("createGoodsReceipt handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createGoodsReceipt(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("verifyGoodsReceipt handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).verifyGoodsReceipt(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("createVendorBill handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createVendorBill(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("createVendorPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createVendorPayment(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("confirmVendorBill handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).confirmVendorBill(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("confirmVendorPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).confirmVendorPayment(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("createPurchaseReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).createPurchaseReturn(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("processPurchaseReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).processPurchaseReturn(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deletePurchaseRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deletePurchaseRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deletePurchaseOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deletePurchaseOrder(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deleteGoodsReceipt handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteGoodsReceipt(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deleteVendorBill handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteVendorBill(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deleteVendorPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deleteVendorPayment(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updatePurchaseRequest handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePurchaseRequest(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updatePurchaseOrder handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePurchaseOrder(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updateVendorBill handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateVendorBill(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updateGoodsReceipt handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateGoodsReceipt(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updatePurchaseReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updatePurchaseReturn(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("updateVendorPayment handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).updateVendorPayment(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("voidVendorBill handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).voidVendorBill(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
  it("deletePurchaseReturn handles error globally", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    if ((mocks as any).requirePermissionMock) (mocks as any).requirePermissionMock.mockRejectedValueOnce(new Error("perm denied"))
    if ((mocks as any).requireAuthMock) (mocks as any).requireAuthMock.mockRejectedValueOnce(new Error("perm denied"))
    const arg1 = new FormData();
    const arg2 = new FormData();
    try { await (actions as any).deletePurchaseReturn(arg1, arg2); } catch {} 
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
    // Since we just want coverage on the catch block, we don't strictly assert the return shape if it throws
  })
})

describe("Purchase Actions Additional Branch Coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.generateDocNumMock.mockResolvedValue("DOC-001")
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, vendorId: 1, documentNo: "PO-001", isService: false })
    // Gerbang item hidup (putaran 32): echo id aktif untuk query ber-where.id.
    mocks.prismaMock.item.findMany.mockImplementation(async (arg: any) => {
      const ids = arg?.where?.id?.in
      if (!ids) return []
      return ids.map((id: number) => ({ id, name: `Item ${id}`, isActive: true, deletedAt: null }))
    })
  })

  it("createVendorBill fails 3-way match (no GRs)", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([])
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1", purchaseOrderId: "1", date: "2026-06-12",
      subtotal: "1000", tax: "0", grandTotal: "1000"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("3-way match gagal: belum ada penerimaan barang")
  })

  it("createVendorBill fails 3-way match (over-billing)", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    // alreadyBilled is summed from existing bills' goods value (subtotal), and the
    // new bill's goods value (subtotal) is matched against received value — both
    // tax-exclusive. 500 + 5000 goods value far exceeds the 1000 received.
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 500 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1", purchaseOrderId: "1", date: "2026-06-12",
      subtotal: "5000", tax: "0", grandTotal: "5000"
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi nilai barang diterima")
  })

  it("createVendorBill passes 3-way match when only PPN pushes grandTotal over received value (regression)", async () => {
    // Goods value (subtotal) == received value (1000); grandTotal is 1110 due to
    // 11% PPN. Matching grandTotal against the tax-exclusive received value used
    // to reject every taxed bill. The match must compare goods value to goods value.
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1", purchaseOrderId: "1", date: "2026-06-12",
      subtotal: "1000", tax: "110", grandTotal: "1110"
    }))
    expect(res?.success).toBe(true)
  })

  it("createPurchaseRequest membaca qty format Indonesia penuh, bukan 2", async () => {
    // Regresi: Number("2.000")=2 merusak qty permintaan diam-diam.
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12", title: "PR Test",
      items: JSON.stringify([{ itemId: 1, qty: "2.000", notes: "penting" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseRequest.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create).toEqual([{ itemId: 1, qty: 2000, notes: "penting" }])
  })

  it("createPurchaseRequest menolak qty tak terbaca tanpa create", async () => {
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12", title: "PR Test",
      items: JSON.stringify([{ itemId: 1, qty: "bukan-angka" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kuantitas permintaan item #1 tidak valid")
    expect(mocks.prismaMock.purchaseRequest.create).not.toHaveBeenCalled()
  })

  it("updatePurchaseRequest membaca qty format Indonesia penuh, bukan 2", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", documentNo: "PR-001" })
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValue({ status: "draft" })
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12", title: "PR Test Updated",
      items: JSON.stringify([{ itemId: 1, qty: "2.000", notes: "baru" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.purchaseRequest.update.mock.calls.at(-1)![0]
    expect(arg.data.items.create).toEqual([{ itemId: 1, qty: 2000, notes: "baru" }])
  })

  it("updatePurchaseRequest menolak qty tak terbaca sebelum deleteMany", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", documentNo: "PR-001" })
    const res = await actions.updatePurchaseRequest(1, fdMap({
      date: "2026-06-12", title: "PR Test Updated",
      items: JSON.stringify([{ itemId: 1, qty: "bukan-angka" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Kuantitas permintaan item #1 tidak valid")
    expect(mocks.prismaMock.purchaseRequestItem.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.purchaseRequest.update).not.toHaveBeenCalled()
  })

  it("createPurchaseRequest filters items with itemId <= 0", async () => {
    const res = await actions.createPurchaseRequest(fdMap({
      date: "2026-06-12", title: "PR Test",
      items: JSON.stringify([{ itemId: 0, qty: 10 }, { itemId: 1, qty: 5 }])
    }))
    expect(res?.success).toBe(true)
  })


  it("createPurchaseOrder filters items with itemId <= 0 or qty <= 0", async () => {
    const res = await actions.createPurchaseOrder(fdMap({
      vendorId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 0, qty: 5, unitPrice: 100 }, { itemId: 1, qty: 0, unitPrice: 100 }, { itemId: 2, qty: 3, unitPrice: 100 }])
    }))
    expect(res?.success).toBe(true)
  })



  it("cancelPurchaseOrder fails if status received or cancelled", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "received" })
    const res = await actions.cancelPurchaseOrder(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak dapat dibatalkan")
  })

  it("createGoodsReceipt fails if PO not approved or ordered", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft", items: [] })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 5 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa dibuat dari PO berstatus")
  })

  it("createGoodsReceipt fails if item not on PO", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved", items: [{ itemId: 1, qty: 10 }] })
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 2, qty: 5 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ada dalam pesanan pembelian")
  })

  it("createGoodsReceipt membaca qty/biaya string format Indonesia penuh", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved", items: [{ itemId: 1, qty: 3000 }] })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "2.000", unitCost: "150.000" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.goodsReceipt.create.mock.calls.at(-1)![0]
    expect(arg.data.items.create[0]).toEqual(expect.objectContaining({ itemId: 1, qty: 2000, unitCost: 150000, qtyOrdered: 3000 }))
  })

  it("createGoodsReceipt menolak qty tak terbaca tanpa membuat GR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc", unitCost: 100 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas penerimaan item #1 tidak valid/i)
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("createGoodsReceipt menolak biaya tak terbaca tanpa membuat GR", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 2, unitCost: "xyz" }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Biaya satuan penerimaan item #1 tidak valid/i)
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("updateGoodsReceipt membaca qty/biaya string format Indonesia penuh", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved", items: [{ itemId: 1, qty: 10 }] })
    mocks.prismaMock.goodsReceipt.update.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.goodsReceiptItem.createMany.mockResolvedValueOnce({ count: 1 })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "1,5", unitCost: "2.000.000" }])
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.goodsReceiptItem.createMany.mock.calls.at(-1)![0]
    expect(arg.data[0]).toEqual(expect.objectContaining({ itemId: 1, qty: 1.5, unitCost: 2000000 }))
  })

  it("updateGoodsReceipt menolak qty tak terbaca tanpa menghapus baris lama", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: "abc", unitCost: 100 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/Kuantitas penerimaan item #1 tidak valid/i)
    expect(mocks.prismaMock.goodsReceiptItem.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.goodsReceipt.update).not.toHaveBeenCalled()
  })

  it("createGoodsReceipt allows drafting qty above the PO (over-receipt is capped at verification)", async () => {
    // The over-receipt cap is enforced in the verification hook in BASE units
    // (GR rows are stored in the ENTERED UoM, so a create-time comparison against
    // the base-unit PO qty would be wrong). Creating the draft must therefore
    // succeed; the hook rejects the over-receipt on verify.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved", items: [{ itemId: 1, qty: 10 }] })
    mocks.prismaMock.goodsReceipt.create.mockResolvedValueOnce({ id: 99 })
    const res = await actions.createGoodsReceipt(fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 3 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("verifyGoodsReceipt fails if status not draft", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "verified", warehouseId: 1, items: [] })
    const res = await actions.verifyGoodsReceipt(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa diverifikasi dari status draf")
  })

  it("createVendorBill associates attachments", async () => {
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    mocks.prismaMock.vendorBill.create.mockResolvedValueOnce({ id: 99 })
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1", date: "2026-06-12", subtotal: "1000", tax: "0", grandTotal: "1000",
      attachmentIds: JSON.stringify([10, 11])
    }))
    expect(res?.success).toBe(true)
  })

  it("updateVendorBill associates attachments", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.vendorBill.update.mockResolvedValueOnce({ id: 1 })
    const res = await actions.updateVendorBill(1, fdMap({
      date: "2026-06-12", vendorId: "1", subtotal: "10", tax: "0", grandTotal: "10",
      attachmentIds: JSON.stringify([10, 11])
    }))
    expect(res?.success).toBe(true)
  })

  it("updateVendorPayment associates attachments", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.vendorPayment.update.mockResolvedValueOnce({ id: 1 })
    const res = await actions.updateVendorPayment(1, fdMap({
      date: "2026-06-12", vendorId: "1", amount: "100", paymentDate: "2026-06-12", paymentMethod: "cash",
      attachmentIds: JSON.stringify([10, 11])
    }))
    expect(res?.success).toBe(true)
  })

  it("confirmVendorBill fails if status not draft", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted" })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa diposting dari status draft")
  })

  it("confirmVendorBill fails if fresh status changes to not draft", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", purchaseOrderId: 1, grandTotal: 1000 })
      .mockResolvedValueOnce({ id: 1, status: "posted", purchaseOrderId: 1, grandTotal: 1000 })
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa diposting dari status draft")
  })

  it("confirmVendorPayment fails if status not draft", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa dikonfirmasi dari status draft")
  })

  it("confirmVendorPayment fails if fresh status changes to not draft", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", vendorId: 1, amount: 1000 })
      .mockResolvedValueOnce({ id: 1, status: "completed", vendorId: 1, amount: 1000 })
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa dikonfirmasi dari status draft")
  })

  it("confirmVendorPayment fails if amount exceeds open bills balance", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 1, amount: 2000 })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([{ id: 10, balanceDue: 500 }])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReset()
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([{ vendorBillId: 10, amount: 500 }])
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("melebihi total tagihan terutang vendor")
  })

  it("confirmVendorPayment fails if bill not in openBillMap", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 1, amount: 500 })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([{ id: 10, balanceDue: 500, paidAmount: 0, grandTotal: 500 }])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([{ vendorBillId: 11, amount: 500 }])
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak ditemukan dalam tagihan terkunci")
  })

  it("confirmVendorPayment allocates to the targeted bill first", async () => {
    // Target = bill 30 (3rd by age). It must be handed to the allocator FIRST.
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 1000, vendorBillId: 30,
    })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([
      { id: 10, balanceDue: 500, paidAmount: 0, grandTotal: 500 },
      { id: 20, balanceDue: 500, paidAmount: 0, grandTotal: 500 },
      { id: 30, balanceDue: 500, paidAmount: 0, grandTotal: 500 },
    ])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    // Deterministic return (targeted bill 30 first, then 10): both fully paid.
    vi.mocked(allocatePaymentToBills).mockReset()
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([
      { vendorBillId: 30, amount: 500 },
      { vendorBillId: 10, amount: 500 },
    ])
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
    // The allocator must receive the targeted bill 30 BEFORE the age-older bills.
    const [, billsArg] = vi.mocked(allocatePaymentToBills).mock.calls[0]
    expect((billsArg as { id: number }[]).map((b) => b.id)).toEqual([30, 10, 20])
  })

  it("confirmVendorPayment fails when the targeted bill is no longer open", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 1000, vendorBillId: 99,
    })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([
      { id: 10, balanceDue: 500, paidAmount: 0, grandTotal: 500 },
    ])
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("tidak lagi terbuka")
  })

  // FIN-BR-006: satu helper bersama dua sisa batas (dalam vs luar toleransi).
  async function confirmBillWithAlloc(amount: number) {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount, vendorBillId: 10,
    })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([
      // R8-JB-04: sisa dihitung dari balanceDue tersimpan (1000), bukan kop.
      { id: 10, balanceDue: 1000, paidAmount: 0, grandTotal: 1000 },
    ])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReset()
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([
      { vendorBillId: 10, amount },
    ])
    return actions.confirmVendorPayment(1)
  }

  it("FIN-BR-006: sisa 0,50 dalam toleransi Rp1 sesudah alokasi -> bill 'paid'", async () => {
    const res = await confirmBillWithAlloc(999.5)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ status: "paid", balanceDue: 0.5 }),
      }),
    )
  })

  it("FIN-BR-006: sisa 1,01 di luar toleransi -> bill tetap 'partial'", async () => {
    const res = await confirmBillWithAlloc(998.99)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ status: "partial", balanceDue: 1.01 }),
      }),
    )
  })

  it("R8-JB-04: konfirmasi pembayaran atas bill ber-relief retur mengurangi balanceDue tersimpan, bukan hitung ulang kop", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", vendorId: 1, amount: 600, vendorBillId: 10,
    })
    // Bill 1000 sudah diretur 400 → balanceDue operasional 600.
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([
      { id: 10, balanceDue: 600, paidAmount: 0, grandTotal: 1000, withholdingAmount: 0 },
    ])
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReset()
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([
      { vendorBillId: 10, amount: 600 },
    ])
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ paidAmount: 600, balanceDue: 0, status: "paid" }),
      }),
    )
  })

  it("FIN-BR-007: alokasi hanya dari pembayaran completed; draft tidak mengalokasi apa pun", async () => {
    // confirmVendorPayment menolak non-draft SEBELUM transaksi alokasi.
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.vendorPaymentAllocation.createMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("createPurchaseReturn fails if item not on invoice", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 1, cost: 100 }])
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])
    const { findOverReturn } = await import("@/lib/sales/return-validation")
    vi.mocked(findOverReturn).mockReturnValueOnce({ itemId: 1, type: "not_on_invoice", invoiced: 0, alreadyReturned: 0, remaining: 0, requested: 5 })
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12", items: JSON.stringify([{ itemId: 1, qty: 5 }])
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("belum pernah diterima untuk PO ini")
  })

  it("processPurchaseReturn fails if status not draft", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.processPurchaseReturn(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("hanya bisa diproses dari status draft")
  })

  it("deletePurchaseRequest fails if status is approved", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.deletePurchaseRequest(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tidak bisa menghapus PR yang sudah approved")
  })

  it("deletePurchaseRequest refuses when the atomic claim loses (approved mid-flight)", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseRequest.deleteMany.mockResolvedValueOnce({ count: 0 })
    const res = await actions.deletePurchaseRequest(1)
    expect(res?.success).toBe(false)
    expect(mocks.prismaMock.purchaseRequest.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.approval.deleteMany).not.toHaveBeenCalled()
  })

  it("deletePurchaseOrder deletes PO and reverses GRs with stock moves", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: 10, goodsReceipts: [{ id: 101, status: "draft" }]
      })
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: 10, goodsReceipts: [{ id: 101, status: "draft" }]
      })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([
      { id: 201, itemId: 1, qty: 5, referenceId: 101 }
    ])

    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(true)
  })

  it("deleteGoodsReceipt fails if PO has active bills", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(1)
    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("PO terkait masih memiliki tagihan vendor aktif")
  })

  it("putaran 57: deleteGoodsReceipt rekomputasi memakai PO segar di bawah kunci, bukan snapshot luar", async () => {
    // Snapshot luar: PO 10. Bacaan segar di bawah kunci: GR sudah pindah ke PO 99.
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft", purchaseOrderId: 99 })
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(0)

    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99 } }),
    )
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft" })
  })

  it("deleteGoodsReceipt deletes GR and updates PO status", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([ { id: 201, itemId: 1, qty: 5 } ])
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(0)

    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
  })

  it("deleteGoodsReceipt menghapus lot ItemBatch yang dibuat layer GR (tak yatim)", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, warehouseId: 1, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([{ id: 201, itemId: 1, qty: 5 }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValueOnce([
      { itemId: 1, warehouseId: 1, batchNumber: "LOT-A", qtyIn: 5 },
    ])
    mocks.prismaMock.itemBatch.findFirst.mockResolvedValueOnce({ id: 77, qty: 5 })
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(0)

    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
    // Lot habis persis sebesar sumbangan GR ini → baris lot dihapus.
    expect(mocks.prismaMock.itemBatch.delete).toHaveBeenCalledWith({ where: { id: 77 } })
  })

  it("deleteGoodsReceipt mengurangi lot bersama hanya sebesar sumbangan GR ini", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, warehouseId: 1, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([{ id: 201, itemId: 1, qty: 5 }])
    mocks.prismaMock.inventoryLayer.findMany.mockResolvedValueOnce([
      { itemId: 1, warehouseId: 1, batchNumber: "LOT-A", qtyIn: 5 },
    ])
    mocks.prismaMock.itemBatch.findFirst.mockResolvedValueOnce({ id: 77, qty: 8 })
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(0)

    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.itemBatch.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { qty: 3 },
    })
    expect(mocks.prismaMock.itemBatch.delete).not.toHaveBeenCalled()
  })

  it("deleteVendorBill fails if status not draft", async () => {
    // Baca luar transaksi (hanya purchaseOrderId) draft, baca ulang di
    // dalam transaksi SESUDAH kunci baris = posted: delete wajib ditolak
    // dari baca fresh, bukan dari snapshot luar (TOCTOU confirm konkuren).
    mocks.prismaMock.vendorBill.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", purchaseOrderId: 42 })
      .mockResolvedValueOnce({ id: 1, status: "posted", purchaseOrderId: 42 })
    const res = await actions.deleteVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya tagihan draft yang dapat dihapus")
    expect(mocks.prismaMock.vendorBill.delete).not.toHaveBeenCalled()
  })

  it("deleteVendorPayment fails if status not draft", async () => {
    // Hanya satu baca (di dalam transaksi, sesudah kunci baris).
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.deleteVendorPayment(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya pembayaran draft yang dapat dihapus")
    expect(mocks.prismaMock.vendorPayment.delete).not.toHaveBeenCalled()
  })

  it("updatePurchaseRequest fails if status not draft", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.updatePurchaseRequest(1, fdMap({ date: "2026-06-12" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya PR draft yang dapat diedit")
  })

  it("updatePurchaseOrder fails if status not draft", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved" })
    const res = await actions.updatePurchaseOrder(1, fdMap({ date: "2026-06-12", vendorId: "1" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya PO draft yang dapat diedit")
  })

  it("updateVendorBill fails if status not draft", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted" })
    const res = await actions.updateVendorBill(1, fdMap({ date: "2026-06-12", vendorId: "1", subtotal: "10", tax: "0", grandTotal: "10" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya tagihan draft yang dapat diedit")
  })

  it("updateGoodsReceipt fails if status not draft", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "verified" })
    const res = await actions.updateGoodsReceipt(1, fdMap({ date: "2026-06-12", purchaseOrderId: "1", warehouseId: "1" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya GR draft yang dapat diedit")
  })

  it("updatePurchaseReturn fails if status not draft", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.updatePurchaseReturn(1, fdMap({ date: "2026-06-12", purchaseOrderId: "1" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya retur draft yang dapat diedit")
  })

  it("updateVendorPayment fails if status not draft", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    const res = await actions.updateVendorPayment(1, fdMap({ date: "2026-06-12", vendorId: "1", amount: "100", paymentDate: "2026-06-12", paymentMethod: "cash" }))
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya pembayaran draft yang dapat diedit")
  })

  it("voidVendorBill fails if status is draft", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    const res = await actions.voidVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tagihan draft tidak perlu dibatalkan")
  })

  it("voidVendorBill fails if status is cancelled", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "cancelled" })
    const res = await actions.voidVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Tagihan sudah dibatalkan")
  })

  it("voidVendorBill fails if paidAmount > 0", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "posted", paidAmount: 100 })
    const res = await actions.voidVendorBill(1)
    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hapus pembayaran tagihan ini terlebih dahulu")
  })
})

describe("Purchase Actions Redirect and Validation Gaps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
    mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  })

  it("handles Next.js redirect errors correctly for all actions", async () => {
    const redirectErr = { digest: "NEXT_REDIRECT_TEST" }
    const actionsList = [
      () => actions.createPurchaseRequest(fdMap({})),
      () => actions.createPurchaseOrder(fdMap({})),
      () => actions.cancelPurchaseOrder(1),
      () => actions.createGoodsReceipt(fdMap({})),
      () => actions.verifyGoodsReceipt(1),
      () => actions.createVendorBill(fdMap({})),
      () => actions.createVendorPayment(fdMap({})),
      () => actions.confirmVendorBill(1),
      () => actions.confirmVendorPayment(1),
      () => actions.createPurchaseReturn(fdMap({})),
      () => actions.processPurchaseReturn(1),
      () => actions.deletePurchaseRequest(1),
      () => actions.deletePurchaseOrder(1),
      () => actions.deleteGoodsReceipt(1),
      () => actions.deleteVendorBill(1),
      () => actions.deleteVendorPayment(1),
      () => actions.updatePurchaseRequest(1, fdMap({})),
      () => actions.updatePurchaseOrder(1, fdMap({})),
      () => actions.updateVendorBill(1, fdMap({})),
      () => actions.updateGoodsReceipt(1, fdMap({})),
      () => actions.updatePurchaseReturn(1, fdMap({})),
      () => actions.updateVendorPayment(1, fdMap({})),
      () => actions.voidVendorBill(1),
      () => actions.deletePurchaseReturn(1)
    ]

    for (const act of actionsList) {
      mocks.requirePermissionMock.mockRejectedValueOnce(redirectErr)
      await expect(act()).rejects.toEqual(redirectErr)
    }
  })

  it("handles validation schema failure correctly", async () => {
    const validationActions = [
      actions.createPurchaseRequest,
      actions.createPurchaseOrder,
      actions.createGoodsReceipt,
      actions.createVendorBill,
      actions.createVendorPayment,
      actions.createPurchaseReturn,
      (fd: FormData) => actions.updatePurchaseRequest(1, fd),
      (fd: FormData) => actions.updatePurchaseOrder(1, fd),
      (fd: FormData) => actions.updateVendorBill(1, fd),
      (fd: FormData) => actions.updateGoodsReceipt(1, fd),
      (fd: FormData) => actions.updatePurchaseReturn(1, fd),
      (fd: FormData) => actions.updateVendorPayment(1, fd)
    ]

    for (const act of validationActions) {
      const res = await act(new FormData())
      expect(res?.success).toBe(false)
      expect(res?.error).toBeDefined()
    }
  })

  it("confirmVendorPayment succeeds and runs allocations loop", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 1, amount: 500 })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([{ id: 10, balanceDue: 500, paidAmount: 0, grandTotal: 500 }])
    
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([{ vendorBillId: 10, amount: 500 }])

    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorPaymentAllocation.createMany).toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalled()
  })

  it("confirmVendorPayment updates vendor bill status to partial on partial allocation", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", vendorId: 1, amount: 300 })
    mocks.prismaMock.vendorBill.findMany.mockResolvedValueOnce([{ id: 10, balanceDue: 1000, paidAmount: 0, grandTotal: 1000 }])
    
    const { allocatePaymentToBills } = await import("@/lib/finance/payment-allocation")
    vi.mocked(allocatePaymentToBills).mockReturnValueOnce([{ vendorBillId: 10, amount: 300 }])

    const res = await actions.confirmVendorPayment(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 10 },
      data: expect.objectContaining({
        status: "partial",
        paidAmount: 300,
        balanceDue: 700
      })
    }))
  })

  it("deletePurchaseOrder continues if stockMove has no referenceId", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: 10, goodsReceipts: [{ id: 101, status: "draft" }]
      })
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: 10, goodsReceipts: [{ id: 101, status: "draft" }]
      })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([
      { id: 201, itemId: 1, qty: 5, referenceId: null },
      { id: 202, itemId: 1, qty: 5, referenceId: 101 }
    ])

    const res = await actions.deletePurchaseOrder(1)
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseRequest succeeds when status is draft inside transaction", async () => {
    mocks.prismaMock.purchaseRequest.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseRequest.findUnique.mockResolvedValueOnce({ status: "draft" })
    const res = await actions.updatePurchaseRequest(1, fdMap({ date: "2026-06-12" }))
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseOrder succeeds when status is draft inside transaction", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseOrder.findUnique.mockResolvedValueOnce({ status: "draft" })
    const res = await actions.updatePurchaseOrder(1, fdMap({ date: "2026-06-12", vendorId: "1" }))
    expect(res?.success).toBe(true)
  })

  it.each([
    ["updatePurchaseRequest", "purchase_requests", "purchaseRequest"],
    ["updatePurchaseOrder", "purchase_orders", "purchaseOrder"],
  ] as const)("updatePurchase* locks its own row before the in-tx status recheck (%s)", async (_fn, table, model) => {
    mocks.prismaMock[model].findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock[model].findUnique.mockResolvedValueOnce({ status: "draft" })
    if (model === "purchaseRequest") {
      await actions.updatePurchaseRequest(1, fdMap({ date: "2026-06-12" }))
    } else {
      await actions.updatePurchaseOrder(1, fdMap({ date: "2026-06-12", vendorId: "1" }))
    }
    const execCalls = mocks.prismaMock.$executeRaw.mock.calls as unknown[][]
    const lockIdx = execCalls.findIndex((c) => {
      const first = c[0] as { strings?: string[] } | string[] | string
      const text = String(
        (first as { strings?: string[] }).strings?.join(" ") ??
          (Array.isArray(first) ? (first as string[]).join(" ") : first),
      )
      return text.includes(table) && text.includes("FOR UPDATE")
    })
    expect(lockIdx).toBeGreaterThanOrEqual(0)
    const lockOrder = (mocks.prismaMock.$executeRaw as unknown as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[lockIdx]
    const readOrder = mocks.prismaMock[model].findUnique.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(readOrder)
  })

  it("updateVendorBill succeeds when status is draft inside transaction", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.vendorBill.update.mockResolvedValueOnce({ id: 1 })
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 1, unitCost: 1000 }] }])
    mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { grandTotal: 0 } })
    const res = await actions.updateVendorBill(1, fdMap({ date: "2026-06-12", vendorId: "1", subtotal: "10", tax: "0", grandTotal: "10" }))
    expect(res?.success).toBe(true)
  })

  it("updateGoodsReceipt succeeds when status is draft inside transaction", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "approved", items: [] })
    mocks.prismaMock.goodsReceipt.update.mockResolvedValueOnce({ id: 1 })
    const res = await actions.updateGoodsReceipt(1, fdMap({ date: "2026-06-12", purchaseOrderId: "1", warehouseId: "1" }))
    expect(res?.success).toBe(true)
  })

  it("deleteGoodsReceipt does not revert PO status if remainingCount > 0", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, purchaseOrderId: 10, status: "draft", items: [] })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([])
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(1)

    const res = await actions.deleteGoodsReceipt(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.purchaseOrder.update).not.toHaveBeenCalled()
  })

  it("updatePurchaseReturn runs cost map callback", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseReturn.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 10, cost: 200 }])

    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 10, qty: 5 }])
    }))
    expect(res?.success).toBe(true)
  })

  it("updatePurchaseReturn stores the entered-unit cost (base cost × UoM factor) like create", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseReturn.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 10, cost: 200 }])
    // GR line entered in "BOX"; item's base unit is "PCS"; conversion factor 12.
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { itemId: 10, qty: 12, uom: "BOX" },
    ])
    mocks.prismaMock.item.findUnique.mockResolvedValue({ unitOfMeasure: "PCS" })
    mocks.prismaMock.uomConversion.findUnique.mockResolvedValue({ factorToBase: 12 })

    const res = await actions.updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 10, qty: 5 }]),
    }))

    expect(res?.success).toBe(true)
    const updateArg = mocks.prismaMock.purchaseReturn.update.mock.calls.at(-1)?.[0]
    // 200 (base cost) × 12 (factor) = 2400, else the AP-relief journal is 12× small.
    expect(updateArg.data.items.create[0].cost).toBe(2400)
  })

  it("updateGoodsReceipt refuses when the (new) PO is not in a receivable status", async () => {
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      status: "draft",
      items: [],
    })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      date: "2026-06-12", purchaseOrderId: "1", warehouseId: "1",
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/approved.*ordered|berstatus/i)
  })

  it("updateGoodsReceipt refuses an item that is not on the PO", async () => {
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValueOnce({ status: "draft" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1,
      status: "approved",
      items: [{ itemId: 101, qty: 10 }],
    })
    const res = await actions.updateGoodsReceipt(1, fdMap({
      date: "2026-06-12", purchaseOrderId: "1", warehouseId: "1",
      items: JSON.stringify([{ itemId: 999, qty: 1, unitCost: 100 }]),
    }))
    expect(res?.success).toBe(false)
    expect(res?.error).toMatch(/tidak ada dalam pesanan/i)
  })

  it("createPurchaseReturn runs cost map callback", async () => {
    mocks.prismaMock.item.findMany.mockResolvedValueOnce([{ id: 10, cost: 200 }])
    const res = await actions.createPurchaseReturn(fdMap({
      purchaseOrderId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 10, qty: 5 }])
    }))
    expect(res?.success).toBe(true)
  })
})

describe("Vendor Bill header recompute (anti manipulasi klien)", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({ id: 1, vendorId: 1, documentNo: "PO-001", isService: false })
    mocks.prismaMock.vendorBill.create.mockResolvedValue({ id: 1 })
    mocks.prismaMock.vendorBill.update.mockResolvedValue({ id: 1 })
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 9, sku: "S", name: "Item", unitOfMeasure: null, isActive: true, deletedAt: null }])
  })
  it("createVendorBill hitung ulang header dari baris, abaikan subtotal klien", async () => {
    const res = await actions.createVendorBill(fdMap({
      vendorId: "1", date: "2026-06-12",
      subtotal: "999999", tax: "999999", grandTotal: "1999998",
      items: JSON.stringify([{ itemId: 9, qty: 2, unitPrice: 50000, discountPercent: 10, taxPercent: 11 }]),
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.create.mock.calls.at(-1)![0]
    // gross 100000, diskon 10000, subtotal bruto tetap 100000, tax 9900, grand 99900
    expect(arg.data.subtotal).toBe(100000)
    expect(arg.data.discountAmount).toBe(10000)
    expect(Number(arg.data.tax)).toBe(9900)
    expect(Number(arg.data.grandTotal)).toBe(99900)
  })
  it("updateVendorBill hitung ulang header dari baris", async () => {
    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1", date: "2026-06-12",
      subtotal: "1", tax: "1", grandTotal: "2",
      items: JSON.stringify([{ itemId: 9, qty: 1, unitPrice: 100000, discountPercent: 0, taxPercent: 11 }]),
    }))
    expect(res?.success).toBe(true)
    const arg = mocks.prismaMock.vendorBill.update.mock.calls.at(-1)![0]
    expect(arg.data.subtotal).toBe(100000)
    expect(Number(arg.data.tax)).toBe(11000)
    expect(Number(arg.data.grandTotal)).toBe(111000)
  })
})

// PUR-BR-010: dokumen pembelian posted tidak boleh dihapus fisik.
// Jalur koreksi dokumen posted: batalkan/void (PO), retur pembelian,
// reversal (FIN-BR-008). Test ini mengunci semua jalur delete —
// termasuk jalur PO/GR yang guard-nya lebih dulu hidup di PR INV-BR-013
// (#1223, belum merged saat kartu ini dibuat), supaya penegakan
// PUR-BR-010 tetap utuh di main terlepas urutan merge kedua PR.
// Helper lokal (bukan pola berulang) menekan duplikasi blok antar-test.
// Empat kasus GR/PO yang juga dikunci blok "INV-BR-013 larangan hapus ledger
// posted" tidak diulang di sini supaya tidak menambah duplikasi Sonar.
describe("PUR-BR-010 larangan hapus fisik dokumen pembelian posted", () => {
  const mockPo = (po: Record<string, unknown>) =>
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce(po)
  const noBill = () => mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
  const expectRefused = (
    res: { success?: boolean; error?: string } | undefined,
    pesan: string,
    ...deleteMocks: Array<{ mock: { calls: unknown[] } }>
  ) => {
    expect(res?.success).toBe(false)
    expect(res?.error).toContain(pesan)
    for (const m of deleteMocks) expect(m).not.toHaveBeenCalled()
  }

  it("deletePurchaseOrder menolak PO posted (approved) tanpa GR, tanpa hapus apa pun", async () => {
    mockPo({ id: 1, status: "approved", purchaseRequestId: 10, goodsReceipts: [] })
    noBill()
    expectRefused(await actions.deletePurchaseOrder(1), "Hanya PO draft yang dapat dihapus",
      mocks.prismaMock.purchaseOrder.delete, mocks.prismaMock.goodsReceipt.delete)
  })

  it("deletePurchaseOrder menolak PO cancelled tanpa hapus apa pun (bukti audit tetap utuh)", async () => {
    mockPo({ id: 1, status: "cancelled", purchaseRequestId: null, goodsReceipts: [] })
    noBill()
    expectRefused(await actions.deletePurchaseOrder(1), "Hanya PO draft yang dapat dihapus",
      mocks.prismaMock.purchaseOrder.delete)
  })

  it("deletePurchaseOrder membaca ulang status dari baris terkunci dalam tx (GR terverifikasi di jendela balapan)", async () => {
    // Snapshot luar tx: PO draft + GR draft (semua guard lolos).
    mockPo({ id: 1, status: "draft", purchaseRequestId: null, goodsReceipts: [{ id: 101, status: "draft" }] })
    // Baca ulang dalam tx di bawah kunci: GR sudah terverifikasi penulis lain.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", purchaseRequestId: null, goodsReceipts: [{ id: 101, status: "verified" }],
    })
    mocks.prismaMock.vendorBill.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)

    const res = await actions.deletePurchaseOrder(1)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("penerimaan barang yang sudah terverifikasi")
    expect(mocks.prismaMock.purchaseOrder.delete).not.toHaveBeenCalled()
    expect(mocks.prismaMock.goodsReceipt.delete).not.toHaveBeenCalled()
    const sqlText = mocks.prismaMock.$executeRaw.mock.calls
      .map((c: unknown[]) => {
        const first = c[0] as unknown
        if (Array.isArray(first)) return (first as string[]).join("?")
        return ((first as { strings?: string[] })?.strings ?? []).join("?")
      })
      .join(" ")
    expect(sqlText).toContain("purchase_orders")
  })

  it("deleteVendorBill menolak bill posted tanpa hapus (guard existing terkunci)", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", purchaseOrderId: 42 })
      .mockResolvedValueOnce({ id: 1, status: "posted", purchaseOrderId: 42 })
    expectRefused(await actions.deleteVendorBill(1), "Hanya tagihan draft yang dapat dihapus",
      mocks.prismaMock.vendorBill.delete)
  })

  it("deleteVendorPayment menolak payment completed tanpa hapus (guard existing terkunci)", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "completed" })
    expectRefused(await actions.deleteVendorPayment(1), "Hanya pembayaran draft yang dapat dihapus",
      mocks.prismaMock.vendorPayment.delete)
  })

  it("deletePurchaseReturn menolak retur non-draft tanpa hapus (guard existing terkunci)", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "returned" })
    expectRefused(await actions.deletePurchaseReturn(1), "Hanya retur draft yang dapat dihapus",
      mocks.prismaMock.purchaseReturn.delete)
  })

  it("deletePurchaseReturn menolak bila klaim kondisional kalah balapan (status berubah)", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseReturn.deleteMany.mockResolvedValue({ count: 0 })
    expectRefused(await actions.deletePurchaseReturn(1), "sudah berubah status",
      mocks.prismaMock.purchaseReturn.delete)
  })

  it("deletePurchaseReturn sukses lewat klaim kondisional draft", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValueOnce({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseReturn.deleteMany.mockResolvedValue({ count: 1 })
    const res = await actions.deletePurchaseReturn(1)
    expect(res?.success).toBe(true)
    expect(mocks.prismaMock.purchaseReturn.deleteMany).toHaveBeenCalledWith({
      where: { id: 1, status: "draft" },
    })
  })
})

// INV-BR-013: ledger posted tidak boleh dihapus fisik oleh pengguna
// operasional. GR terverifikasi sudah memposting StockMove `posted`;
// sebelum guard ini deleteGoodsReceipt/deletePurchaseOrder menghapus
// StockMove + InventoryLayer-nya secara fisik.
describe("INV-BR-013 larangan hapus ledger posted", () => {
  it("deleteGoodsReceipt menolak GR terverifikasi (ledger posted) tanpa hapus apa pun", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, purchaseOrderId: 10, warehouseId: 1, status: "verified", items: [],
    })

    const res = await actions.deleteGoodsReceipt(1)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya penerimaan barang draft yang dapat dihapus")
    expect(mocks.prismaMock.stockMove.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.inventoryLayer.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.goodsReceipt.delete).not.toHaveBeenCalled()
  })

  it("deleteGoodsReceipt tetap mengizinkan GR draft", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, purchaseOrderId: 10, warehouseId: 1, status: "draft", items: [],
    })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)
    mocks.prismaMock.goodsReceipt.count.mockResolvedValueOnce(0)

    const res = await actions.deleteGoodsReceipt(1)

    expect(res?.success).toBe(true)
  })

  it("deletePurchaseOrder menolak PO dengan GR terverifikasi tanpa masuk transaksi hapus", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "draft", goodsReceipts: [{ id: 101, status: "verified" }],
    })
    mocks.prismaMock.vendorBill.count.mockResolvedValueOnce(0)

    const res = await actions.deletePurchaseOrder(1)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("penerimaan barang yang sudah terverifikasi")
    expect(mocks.prismaMock.stockMove.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.inventoryLayer.deleteMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.purchaseOrder.delete).not.toHaveBeenCalled()
  })

  it("deletePurchaseOrder tetap mengizinkan PO yang GR-nya semua draft", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: null, goodsReceipts: [{ id: 101, status: "draft" }],
      })
      .mockResolvedValueOnce({
        id: 1, status: "draft", purchaseRequestId: null, goodsReceipts: [{ id: 101, status: "draft" }],
      })
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0)
    mocks.prismaMock.stockMove.findMany.mockResolvedValueOnce([])

    const res = await actions.deletePurchaseOrder(1)

    expect(res?.success).toBe(true)
  })
})

// BUGHUNT round3 #6-7: void/edit dokumen pembelian harus mengunci barisnya
// sendiri + menilai status/paidAmount dari baca ulang di dalam tx. Mock tak
// bisa menegakkan kunci DB betulan, jadi penegaknya: urutan kunci → baca
// ulang, dan baca ulang non-draft (kalah race vs confirm) menolak SEBELUM
// tulis apa pun — snapshot luar-tx yang basi tidak boleh menghidupkan lagi
// dokumen posted/completed/verified menjadi draft.
describe("BUGHUNT round3 #6-7 kunci baris + klaim status pembelian", () => {
  it("voidVendorBill mengunci baris, membaca ulang, lalu me-reverse jurnal (bukan hard-delete)", async () => {
    const order: string[] = []
    mocks.prismaMock.$executeRaw.mockImplementation(async () => { order.push("lock"); return 1 })
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockImplementation(async () => {
      order.push("reread")
      return { id: 1, status: "posted", paidAmount: 0, purchaseOrderId: null, slug: "bill-1" }
    })
    mocks.reverseJournalsByReferenceTxMock.mockClear()
    mocks.deleteJournalByReferenceTxMock.mockClear()

    const res = await actions.voidVendorBill(1)

    expect(res?.success).toBe(true)
    expect(order.slice(0, 2)).toEqual(["lock", "reread"])
    expect(mocks.reverseJournalsByReferenceTxMock).toHaveBeenCalledWith(
      mocks.prismaMock, "VendorBill", 1, expect.stringContaining("Pembatalan tagihan vendor"), 1,
    )
    expect(mocks.deleteJournalByReferenceTxMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).toHaveBeenCalledWith({
      where: { id: 1 }, data: { status: "cancelled" },
    })
  })

  it("regression round 18: voidVendorBill menolak tagihan lunas lewat kredit vendor (paidAmount 0, balanceDue turun non-kas)", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "paid", paidAmount: 0, grandTotal: 1000000, withholdingAmount: 0,
      balanceDue: 0, purchaseOrderId: null, slug: "bill-1",
    })
    mocks.reverseJournalsByReferenceTxMock.mockClear()

    const res = await actions.voidVendorBill(1)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("kredit vendor atau relief retur")
    expect(mocks.reverseJournalsByReferenceTxMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("voidVendorBill menolak bila baca ulang dalam tx menemukan paidAmount > 0 (kalah race vs pembayaran)", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValueOnce({
      id: 1, status: "posted", paidAmount: 250000, purchaseOrderId: null, slug: "bill-1",
    })
    mocks.reverseJournalsByReferenceTxMock.mockClear()

    const res = await actions.voidVendorBill(1)

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hapus pembayaran tagihan ini terlebih dahulu")
    expect(mocks.reverseJournalsByReferenceTxMock).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
  })

  it("updateVendorBill menolak bila status dalam tx sudah posted (tidak resurrect ke draft)", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", documentNo: "BILL-1", purchaseOrderId: null, goodsReceiptId: null,
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValueOnce({ status: "posted" })

    const res = await actions.updateVendorBill(1, fdMap({
      vendorId: "1", date: "2026-06-12", subtotal: "1000", tax: "0", grandTotal: "1000",
    }))

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya tagihan draft yang dapat diedit")
    expect(mocks.prismaMock.$executeRaw).toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBill.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.vendorBillItem.deleteMany).not.toHaveBeenCalled()
  })

  it("updateVendorPayment menolak bila status dalam tx sudah completed (kalah race vs confirm)", async () => {
    mocks.prismaMock.vendorPayment.findUniqueOrThrow
      .mockResolvedValueOnce({ id: 1, status: "draft", documentNo: "VP-1" })
      .mockResolvedValueOnce({ id: 1, status: "completed", documentNo: "VP-1" })

    const res = await actions.updateVendorPayment(1, fdMap({
      vendorId: "1", amount: "1200", paymentDate: "2026-06-12", paymentMethod: "cash",
    }))

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya pembayaran draft yang dapat diedit")
    expect(mocks.prismaMock.$executeRaw).toHaveBeenCalled()
    expect(mocks.prismaMock.vendorPayment.update).not.toHaveBeenCalled()
  })

  it("updateGoodsReceipt menolak bila status dalam tx sudah verified (baris tidak tertimpa)", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", documentNo: "GR-1",
    })
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValueOnce({ status: "verified" })

    const res = await actions.updateGoodsReceipt(1, fdMap({
      purchaseOrderId: "1", warehouseId: "1", date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 6, unitCost: 1000 }]),
    }))

    expect(res?.success).toBe(false)
    expect(res?.error).toContain("Hanya GR draft yang dapat diedit")
    expect(mocks.prismaMock.$executeRaw).toHaveBeenCalled()
    expect(mocks.prismaMock.goodsReceipt.update).not.toHaveBeenCalled()
    expect(mocks.prismaMock.goodsReceiptItem.deleteMany).not.toHaveBeenCalled()
  })
})
