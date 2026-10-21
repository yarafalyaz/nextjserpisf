import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Jalur "Buat Tagihan dari Penerimaan" harus mengisi `VendorBill.goodsReceiptId`
 * dan `VendorBillItem.goodsReceiptItemId`. Sebelum perbaikan kedua kolom itu tidak
 * pernah ditulis (create-nya bahkan tidak menyertakan field-nya), sehingga
 * backlink "Penerimaan Barang" di halaman tagihan selalu "—" dan laporan Diterima
 * Belum Ditagih (GR/IR) membaca 0 tagihan untuk setiap baris penerimaan.
 */

const mocks = vi.hoisted(() => {
  const txMock: any = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    goodsReceipt: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
    vendorBill: {
      create: vi.fn().mockResolvedValue({ id: 900, purchaseOrderId: 50, goodsReceiptId: 77 }),
      update: vi.fn().mockResolvedValue({ id: 900, purchaseOrderId: 50, goodsReceiptId: 77 }),
      aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal: 0 } }),
      findUnique: vi.fn().mockResolvedValue({ status: "draft" }),
    },
    vendorBillItem: {
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      deleteMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal: 0 } }),
    },
    item: {
      findMany: vi.fn().mockResolvedValue([
        { id: 7, sku: "SKU-7", name: "Barang 7", unitOfMeasure: "PCS" },
        { id: 8, sku: "SKU-8", name: "Barang 8", unitOfMeasure: "PCS" },
      ]),
    },
  };

  const prismaMock: any = {
    vendorBill: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(txMock);
      return Promise.all(ops);
    }),
  };

  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    generateDocNumMock: vi.fn().mockResolvedValue("BILL-900"),
    onVendorBillPostedMock: vi.fn().mockResolvedValue(undefined),
    deleteJournalByReferenceTxMock: vi.fn().mockResolvedValue(undefined),
    prismaMock,
    txMock,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocNumMock,
}));
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onVendorBillPosted: mocks.onVendorBillPostedMock,
  onVendorPaymentCreated: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReference: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReferenceTx: mocks.deleteJournalByReferenceTxMock,
}));

import { createVendorBill, updateVendorBill } from "../purchase.actions";

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v));
  }
  return f;
}

const GR_LINES = [
  { id: 501, itemId: 7 },
  { id: 502, itemId: 8 },
];

/** Form tagihan dari penerimaan: dua baris, nilai 5×200 + 3×100 = 1300. */
function billFromGr(extra: Record<string, string | number> = {}) {
  return fd({
    vendorId: 3,
    purchaseOrderId: 50,
    goodsReceiptId: 77,
    date: "2026-05-02",
    subtotal: 1300,
    tax: 0,
    grandTotal: 1300,
    items: JSON.stringify([
      { itemId: 7, qty: 5, unitPrice: 200, discountPercent: 0, taxPercent: 0 },
      { itemId: 8, qty: 3, unitPrice: 100, discountPercent: 0, taxPercent: 0 },
    ]),
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 });
  mocks.generateDocNumMock.mockResolvedValue("BILL-900");
  mocks.prismaMock.vendorBill.findFirst.mockResolvedValue(null);

  mocks.txMock.$executeRaw.mockResolvedValue(1);
  mocks.txMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
    vendorId: 3,
    documentNo: "PO-050",
    isService: false,
  });
  mocks.txMock.purchaseOrder.findUnique.mockResolvedValue(null);
  mocks.txMock.goodsReceipt.findUnique.mockResolvedValue({
    id: 77,
    documentNo: "GR-077",
    status: "verified",
    purchaseOrder: { vendorId: 3 },
  });
  mocks.txMock.goodsReceipt.findMany.mockResolvedValue([
    { items: [{ qty: 5, unitCost: 200 }, { qty: 3, unitCost: 100 }] },
  ]);
  mocks.txMock.goodsReceiptItem.findMany.mockImplementation(async (args: any) =>
    args?.where?.goodsReceiptId ? GR_LINES : [{ qty: 5, unitCost: 200 }, { qty: 3, unitCost: 100 }],
  );
  mocks.txMock.vendorBillItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } });
  mocks.txMock.vendorBill.create.mockResolvedValue({
    id: 900,
    purchaseOrderId: 50,
    goodsReceiptId: 77,
  });
});

describe("createVendorBill dari penerimaan (segmen penerimaan/<slug>)", () => {
  it("mengisi VendorBill.goodsReceiptId dan goodsReceiptItemId tiap baris", async () => {
    const res = await createVendorBill(billFromGr());

    expect(res.success).toBe(true);
    expect(mocks.txMock.vendorBill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ goodsReceiptId: 77, purchaseOrderId: 50 }),
      }),
    );

    const created = mocks.txMock.vendorBillItem.createMany.mock.calls[0][0].data;
    expect(created.map((row: any) => row.goodsReceiptItemId)).toEqual([501, 502]);
    expect(created.map((row: any) => row.vendorBillId)).toEqual([900, 900]);
  });

  it("menautkan dua baris item yang sama ke DUA baris penerimaan berbeda", async () => {
    mocks.txMock.goodsReceiptItem.findMany.mockImplementation(async (args: any) =>
      args?.where?.goodsReceiptId
        ? [
            { id: 501, itemId: 7 },
            { id: 503, itemId: 7 },
          ]
        : [{ qty: 2, unitCost: 200 }, { qty: 3, unitCost: 200 }],
    );

    await createVendorBill(
      billFromGr({
        subtotal: 1000,
        grandTotal: 1000,
        items: JSON.stringify([
          { itemId: 7, qty: 2, unitPrice: 200 },
          { itemId: 7, qty: 3, unitPrice: 200 },
        ]),
      }),
    );

    const created = mocks.txMock.vendorBillItem.createMany.mock.calls[0][0].data;
    expect(created.map((row: any) => row.goodsReceiptItemId)).toEqual([501, 503]);
  });

  it("tetap menulis goodsReceiptItemId null bila tagihan tidak berasal dari penerimaan", async () => {
    await createVendorBill(
      billFromGr({
        goodsReceiptId: "",
        items: JSON.stringify([{ itemId: 7, qty: 5, unitPrice: 200 }]),
        subtotal: 1000,
        grandTotal: 1000,
      }),
    );

    expect(mocks.txMock.goodsReceipt.findUnique).not.toHaveBeenCalled();
    expect(mocks.txMock.vendorBill.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ goodsReceiptId: null }) }),
    );
    const created = mocks.txMock.vendorBillItem.createMany.mock.calls[0][0].data;
    expect(created.every((row: any) => row.goodsReceiptItemId === null)).toBe(true);
  });

  it("menolak menagih penerimaan yang belum diverifikasi", async () => {
    mocks.txMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77,
      documentNo: "GR-077",
      status: "draft",
      purchaseOrder: { vendorId: 3 },
    });

    const res = await createVendorBill(billFromGr());

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/belum diverifikasi/);
    expect(mocks.txMock.vendorBill.create).not.toHaveBeenCalled();
  });

  it("menolak penerimaan milik vendor lain", async () => {
    mocks.txMock.goodsReceipt.findUnique.mockResolvedValue({
      id: 77,
      documentNo: "GR-077",
      status: "verified",
      purchaseOrder: { vendorId: 9 },
    });

    const res = await createVendorBill(billFromGr());

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/vendor penerimaan/);
    expect(mocks.txMock.vendorBill.create).not.toHaveBeenCalled();
  });

  it("menolak penerimaan yang sudah ditagih penuh", async () => {
    // Nilai barang diterima = 5×200 + 3×100 = 1300, sudah ditagih 1300.
    mocks.txMock.vendorBillItem.aggregate.mockResolvedValue({ _sum: { subtotal: 1300 } });

    const res = await createVendorBill(billFromGr());

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sudah ditagih penuh/);
    expect(mocks.txMock.vendorBill.create).not.toHaveBeenCalled();
  });
});

describe("updateVendorBill mempertahankan tautan ke penerimaan", () => {
  beforeEach(() => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 900,
      documentNo: "BILL-900",
      status: "draft",
      purchaseOrderId: 50,
      goodsReceiptId: 77,
      paidAmount: 0,
    });
    mocks.txMock.vendorBill.findUnique.mockResolvedValue({ status: "draft" });
    mocks.txMock.vendorBill.update.mockResolvedValue({
      id: 900,
      purchaseOrderId: 50,
      goodsReceiptId: 77,
    });
  });

  it("mengisi ulang goodsReceiptItemId saat baris tagihan diganti (delete + recreate)", async () => {
    const res = await updateVendorBill(
      900,
      fd({
        vendorId: 3,
        purchaseOrderId: 50,
        date: "2026-05-02",
        subtotal: 1300,
        tax: 0,
        grandTotal: 1300,
        items: JSON.stringify([
          { itemId: 7, qty: 5, unitPrice: 200 },
          { itemId: 8, qty: 3, unitPrice: 100 },
        ]),
      }),
    );

    expect(res.success).toBe(true);
    expect(mocks.txMock.vendorBillItem.deleteMany).toHaveBeenCalledWith({ where: { vendorBillId: 900 } });
    const created = mocks.txMock.vendorBillItem.createMany.mock.calls[0][0].data;
    expect(created.map((row: any) => row.goodsReceiptItemId)).toEqual([501, 502]);
  });
});
