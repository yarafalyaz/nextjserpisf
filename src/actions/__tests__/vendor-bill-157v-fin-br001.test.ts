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
    purchaseOrder: buildModelMock(),
    purchaseOrderItem: buildModelMock(),
    goodsReceipt: buildModelMock(),
    goodsReceiptItem: buildModelMock(),
    vendorBill: buildModelMock(),
    vendorBillItem: buildModelMock(),
    vendor: buildModelMock(),
    item: buildModelMock(),
    journal: buildModelMock(),
    userWarehouse: buildModelMock(),
    workOrder: buildModelMock(),
    productionOrder: buildModelMock(),
    productionCost: buildModelMock(),
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
    generateDocNumMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: mocks.generateDocNumMock }))
vi.mock("@/lib/services/journal-builder.service", () => ({ createGlJournal: vi.fn() }))
vi.mock("@/lib/services/inventory.service", () => ({
  inventoryService: { receivePurchase: vi.fn().mockResolvedValue({}), processPurchaseReturn: vi.fn().mockResolvedValue({}) },
}))
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn().mockResolvedValue({}) },
}))
vi.mock("@/lib/services/approval-workflow.service", () => ({
  requestApprovalIfConfigured: vi.fn().mockResolvedValue({}),
  assertApproved: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/goods-receipt.hook", () => ({
  onGoodsReceiptVerified: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/purchase-order.hook", () => ({
  onPurchaseOrderCreated: vi.fn().mockResolvedValue({}),
}))
vi.mock("@/lib/hooks/purchase-return.hook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks/purchase-return.hook")>();
  return { ...actual, onPurchaseReturnProcessed: vi.fn().mockResolvedValue({}) };
})

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
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] })
  mocks.generateDocNumMock.mockResolvedValue("DOC-001")
  mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
  mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
    id: 1, vendorId: 1, documentNo: "PO-001", isService: false,
  })
  mocks.prismaMock.purchaseOrderItem.findMany.mockResolvedValue([
    { itemId: 7, unitPrice: 10000, qty: 10 },
  ])
  mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])
  mocks.prismaMock.goodsReceipt.findMany.mockResolvedValue([{ items: [{ qty: 10, unitCost: 10000 }] }])
  mocks.prismaMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
  mocks.prismaMock.vendorBillItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } })
  mocks.prismaMock.item.findMany.mockResolvedValue([
    { id: 7, sku: "BRG-01", name: "Baut", unitOfMeasure: "PCS" },
  ])
})

const PO_BILL = (items: unknown[], extra: Record<string, string> = {}) =>
  fdMap({
    vendorId: "1",
    purchaseOrderId: "1",
    date: "2026-06-12",
    terms: "TERMIN 1/2 — DP 50% PO-001",
    subtotal: "100000",
    tax: "0",
    grandTotal: "100000",
    items: JSON.stringify(items),
    ...extra,
  })

// Penegak ringkas: satu definisi, dipakai semua kasus (hindari pola expect berulang).
function expectReject(res: unknown, pattern: RegExp) {
  expect((res as { success?: boolean })?.success).toBe(false)
  expect((res as { error?: string })?.error).toMatch(pattern)
}

describe("F-2026-10-28-157-V E157B guard per-baris + referensi termin (create/edit/confirm)", () => {
  // E157B-1: over-bill HARGA per baris > toleransi lolos (create/confirm) = MERAH.
  it("E157B-1 menolak create bill ber-PO yang unitPrice barisnya over acuan PO", async () => {
    const res = await actions.createVendorBill(
      PO_BILL([{ itemId: 7, qty: 10, unitPrice: 12000, discountPercent: 0, taxPercent: 0 }]),
    )
    expectReject(res, /per baris/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  // E157B-2: diskon sah (net dalam toleransi) ditolak guard per-baris = MERAH.
  it("E157B-2 meloloskan baris diskon yang net-nya dalam toleransi acuan", async () => {
    const res = await actions.createVendorBill(
      PO_BILL([{ itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0.5, taxPercent: 0 }]),
    )
    expect(res?.success).toBe(true)
  })

  // E157B-3: bill tax>0 tanpa nomor valid DITOLAK confirm = MERAH (harus lulus + warning).
  it("E157B-3 confirm lulus + warning saat tax>0 tanpa nomor faktur", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, vendorId: 1,
      subtotal: 100000, tax: 11000, grandTotal: 111000, taxInvoiceNumber: null, terms: "TERMIN 1/1 — lunas",
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, vendorId: 1,
      subtotal: 100000, tax: 11000, grandTotal: 111000, taxInvoiceNumber: null, terms: "TERMIN 1/1 — lunas",
    })
    mocks.prismaMock.vendorBillItem.findMany.mockResolvedValue([
      { itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 11 },
    ])
    const hook = await import("@/lib/hooks/accounting.hook") as any
    const postBill = vi.spyOn(hook, "onVendorBillPosted").mockResolvedValue(undefined)
    const res = await actions.confirmVendorBill(1)
    expect(res?.success).toBe(true)
    expect((res as any).warning).toMatch(/faktur pajak/i)
    postBill.mockRestore()
  })

  // E157B-6: bill ber-PO `terms` format bebas lolos = MERAH.
  it("E157B-6 menolak create bill ber-PO dengan terms format bebas", async () => {
    const res = await actions.createVendorBill(
      PO_BILL(
        [{ itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 0 }],
        { terms: "cicil 3x santai" },
      ),
    )
    expectReject(res, /TERMIN/i)
    expect(mocks.prismaMock.vendorBill.create).not.toHaveBeenCalled()
  })

  // E157B-7: termin tunggal tanpa `terms` ditolak = MERAH.
  it("E157B-7 meloloskan bill ber-PO tanpa terms (termin tunggal)", async () => {
    const f = PO_BILL([{ itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 0 }])
    f.delete("terms")
    const res = await actions.createVendorBill(f)
    expect(res?.success).toBe(true)
  })

  it("edit menahan kenaikan harga per baris di atas toleransi", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateVendorBill(1,
      PO_BILL([{ itemId: 7, qty: 10, unitPrice: 15000, discountPercent: 0, taxPercent: 0 }]),
    )
    expectReject(res, /per baris/i)
  })

  it("edit menolak terms format bebas pada bill ber-PO", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    const res = await actions.updateVendorBill(1,
      PO_BILL(
        [{ itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 0 }],
        { terms: "bayar nanti" },
      ),
    )
    expectReject(res, /TERMIN/i)
  })

  it("confirm menahan baris tersimpan yang over acuan walau create lolos tanpa baris acuan", async () => {
    // Baris tanpa acuan PO (item 99 tak ada di PO) diskip guard — pagar agregat.
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, vendorId: 1,
      subtotal: 100000, tax: 0, grandTotal: 100000, taxInvoiceNumber: null, terms: "TERMIN 1/1 — lunas",
    })
    mocks.prismaMock.vendorBill.findUnique.mockResolvedValue({
      id: 1, status: "draft", purchaseOrderId: 1, vendorId: 1,
      subtotal: 100000, tax: 0, grandTotal: 100000, taxInvoiceNumber: null, terms: "TERMIN 1/1 — lunas",
    })
    mocks.prismaMock.vendorBillItem.findMany.mockResolvedValue([
      { itemId: 7, qty: 10, unitPrice: 13000, discountPercent: 0, taxPercent: 0 },
    ])
    const res = await actions.confirmVendorBill(1)
    expectReject(res, /per baris/i)
  })

  it("E157B-5 aksi isi-nomor menolak nomor tak valid sebelum sentuh jurnal", async () => {
    const fd = new FormData()
    fd.append("taxInvoiceNumber", "!!!")
    const res = await actions.setVendorBillTaxInvoiceNumber(1, fd)
    expectReject(res, /tidak valid/i)
    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
  })

  // Falsifikasi arah Putusan 1 — acuan GR per LINE: dua baris GR item sama
  // (unitCost 10000 + 12000) dikonsumsi berurutan oleh dua baris bill.
  // Plafon agregat GR ikut dinaikkan agar guard per-baris yang diuji,
  // bukan 3-way match.
  it("acuan GR dibaca per baris GR berurutan, bukan first-GR saja", async () => {
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { id: 11, itemId: 7, unitCost: 10000 },
      { id: 12, itemId: 7, unitCost: 12000 },
    ])
    mocks.prismaMock.goodsReceipt.findMany.mockResolvedValueOnce([
      { items: [{ qty: 10, unitCost: 10000 }, { qty: 10, unitCost: 12000 }] },
    ])
    const lines = [
      { itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 0 },
      { itemId: 7, qty: 10, unitPrice: 12000, discountPercent: 0, taxPercent: 0 },
    ]
    const res = await actions.createVendorBill(PO_BILL(lines))
    expect(res?.success).toBe(true)
  })

  it("baris kedua tertahan bila menyimpang dari baris GR keduanya", async () => {
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { id: 11, itemId: 7, unitCost: 10000 },
      { id: 12, itemId: 7, unitCost: 12000 },
    ])
    const lines = [
      { itemId: 7, qty: 10, unitPrice: 10000, discountPercent: 0, taxPercent: 0 },
      { itemId: 7, qty: 10, unitPrice: 20000, discountPercent: 0, taxPercent: 0 },
    ]
    const res = await actions.createVendorBill(PO_BILL(lines))
    expectReject(res, /per baris/i)
  })
})
