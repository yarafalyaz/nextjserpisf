import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Average cost di hook GR: baseline (qtyOnHand, cost) dibaca sebagai meta
 * item SEBELUM kunci baris item (FOR UPDATE), lalu dipakai menghitung
 * rata-rata sesudah OVERRIDE absolut ke Item.cost. Dua GR untuk item
 * average yang sama dari PO berbeda memegang kunci GR/PO berbeda; tx kedua
 * menserialkan di kunci item tetapi menimpa rata-rata tx pertama dengan
 * rata-rata dari baseline basi. Baseline WAJIB dibaca ulang di bawah kunci.
 */

const mocks = vi.hoisted(() => ({
  generateDocumentNumber: vi.fn(),
  generateDocumentNumberBatch: vi.fn(),
  createInLayer: vi.fn(),
  onGoodsReceipt: vi.fn(),
  onServiceGoodsReceipt: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
  generateDocumentNumberBatch: mocks.generateDocumentNumberBatch,
}));
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: mocks.createInLayer }));
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: {
    onGoodsReceipt: mocks.onGoodsReceipt,
    onServiceGoodsReceipt: mocks.onServiceGoodsReceipt,
  },
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}));

import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook";
import { buildGoodsReceiptTx } from "./goods-receipt-fixtures";

describe("onGoodsReceiptVerified: average cost dari baseline terkunci", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateDocumentNumberBatch.mockResolvedValue(["SM-001"]);
  });

  it("rata-rata memakai qty/cost segar di bawah kunci item, bukan meta pra-kunci", async () => {
    const spies = {
      queryRaw: vi.fn().mockResolvedValue([]),
      executeRaw: vi.fn().mockResolvedValue(1),
      grFindUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 100,
        documentNo: "GR-001",
        status: "draft",
        purchaseOrderId: null,
        warehouseId: 1,
        date: new Date("2026-05-01"),
        shippingCost: 0,
        otherCost: 0,
        adminFee: 0,
        items: [{ itemId: 7, qty: 10, unitCost: 300, uom: "PCS" }],
        purchaseOrder: null,
      }),
      moveFindFirst: vi.fn().mockResolvedValue(null),
      moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      grUpdate: vi.fn().mockResolvedValue({}),
      poItemFindMany: vi.fn().mockResolvedValue([]),
      grItemFindMany: vi.fn().mockResolvedValue([]),
      poUpdate: vi.fn().mockResolvedValue({}),
      // Panggilan 1 (pra-kunci): 10 @ 100. Panggilan 2 (di bawah kunci):
      // GR lain sudah commit lebih dulu -> 30 @ 200.
      itemFindMany: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 7,
            unitOfMeasure: "PCS",
            trackBatch: false,
            trackSerial: false,
            isService: false,
            cost: 100,
            qtyOnHand: 10,
            categoryId: null,
            costingMethod: "average",
            category: null,
          },
        ])
        .mockResolvedValueOnce([{ id: 7, qtyOnHand: 30, cost: 200 }]),
      itemUpdate: vi.fn().mockResolvedValue({}),
      uomConversionFindMany: vi.fn().mockResolvedValue([]),
      itemBatchFindFirst: vi.fn().mockResolvedValue(null),
      itemBatchCreate: vi.fn().mockResolvedValue({}),
      itemBatchUpdate: vi.fn().mockResolvedValue({}),
      itemSerialCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
      systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
    };
    const tx = buildGoodsReceiptTx(spies);
    mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));

    await onGoodsReceiptVerified(100, 1);

    // Benar: (30*200 + 10*300) / 40 = 225. Basi: (10*100 + 10*300)/20 = 200.
    expect(spies.itemUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { cost: 225 },
    });
    expect(spies.itemFindMany.mock.calls.length).toBeGreaterThanOrEqual(2);
    const lockOrder = spies.queryRaw.mock.invocationCallOrder.at(-1);
    expect(lockOrder).toBeLessThan(spies.itemFindMany.mock.invocationCallOrder[1]);
  });
});
