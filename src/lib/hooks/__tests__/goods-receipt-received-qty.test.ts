import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `PurchaseOrderItem.receivedQty` dulu kolom mati: tidak ada satu pun
 * `purchaseOrderItem.update` di `src`, sehingga halaman PO ("Diterima") dan
 * laporan PO Outstanding selalu membaca 0 sementara sisa penerimaan sebenarnya
 * dihitung ulang di form penerimaan. Hook verifikasi penerimaan sekarang menulis
 * akumulatornya — ABSOLUT (bukan increment) dari peta yang sama dengan penjagaan
 * over-receipt, dan dikonversi ke satuan basis.
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

function wireTx(opts: {
  poId: number | null;
  grItems: Array<{ itemId: number; qty: number; unitCost?: number; uom?: string | null }>;
  poItems: Array<{ id: number; itemId: number; qty: number }>;
  priorGrItems: Array<{ itemId: number; qty: number; uom?: string | null }>;
  conversions?: Array<{ itemId: number; code: string; factorToBase: number }>;
  itemMeta?: { unitOfMeasure?: string; trackBatch?: boolean; trackSerial?: boolean; isService?: boolean };
}) {
  const meta = opts.itemMeta ?? { unitOfMeasure: "PCS", trackBatch: false, trackSerial: false, isService: false };
  const spies = {
    queryRaw: vi.fn().mockResolvedValue([]),
    executeRaw: vi.fn().mockResolvedValue(1),
    grFindUniqueOrThrow: vi.fn().mockResolvedValue({
      id: 100,
      documentNo: "GR-001",
      status: "draft",
      purchaseOrderId: opts.poId,
      warehouseId: 1,
      date: new Date("2026-05-01"),
      shippingCost: 0,
      otherCost: 0,
      adminFee: 0,
      items: opts.grItems,
      purchaseOrder: opts.poId
        ? { id: opts.poId, shippingCost: 0, serviceFee: 0, discount: 0, items: [] }
        : null,
    }),
    moveFindFirst: vi.fn().mockResolvedValue(null),
    moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
    grUpdate: vi.fn().mockResolvedValue({}),
    poItemFindMany: vi.fn().mockResolvedValue(opts.poItems),
    grItemFindMany: vi.fn().mockResolvedValue(opts.priorGrItems),
    poUpdate: vi.fn().mockResolvedValue({}),
    itemFindMany: vi.fn().mockResolvedValue(
      [...new Set([
        ...opts.grItems.map((g) => g.itemId),
        ...opts.priorGrItems.map((g) => g.itemId),
      ])].map((id) => ({ id, ...meta })),
    ),
    itemUpdate: vi.fn().mockResolvedValue({}),
    uomConversionFindMany: vi.fn().mockResolvedValue(opts.conversions ?? []),
    itemBatchFindFirst: vi.fn().mockResolvedValue(null),
    itemBatchCreate: vi.fn().mockResolvedValue({}),
    itemBatchUpdate: vi.fn().mockResolvedValue({}),
    itemSerialCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
    systemSettingFindFirst: vi.fn().mockResolvedValue({ periodLockDate: null }),
  };
  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    goodsReceipt: { findUniqueOrThrow: spies.grFindUniqueOrThrow, update: spies.grUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
    goodsReceiptItem: { findMany: spies.grItemFindMany },
    purchaseOrder: { update: spies.poUpdate },
    item: { findMany: spies.itemFindMany, update: spies.itemUpdate },
    uomConversion: { findMany: spies.uomConversionFindMany },
    itemBatch: { findFirst: spies.itemBatchFindFirst, create: spies.itemBatchCreate, update: spies.itemBatchUpdate },
    itemSerial: { createMany: spies.itemSerialCreateMany },
    systemSetting: { findFirst: spies.systemSettingFindFirst },
  };
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));
  return { spies };
}

/**
 * Ambil penulisan `received_qty` dari mock. Penulisan kini SATU statement
 * multi-row: mock menerima args tagged-template mentah — strings luar +
 * objek Prisma.Sql tersarang (join CASE, join id). Flatten semua strings
 * untuk teks + jumlah WHEN, flatten semua `values` primitif berurutan:
 * [id, val]×WHEN lalu id… klausa IN (diabaikan).
 */
function receivedQtyWrites(spies: { executeRaw: { mock: { calls: unknown[][] } } }) {
  const writes: { value: unknown; id: unknown }[] = [];
  for (const call of spies.executeRaw.mock.calls) {
    let text = "";
    let whenCount = 0;
    const prims: unknown[] = [];
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (x && typeof x === "object") {
        const o = x as { strings?: unknown; values?: unknown };
        if (Array.isArray(o.strings)) {
          const s = o.strings.join(" ");
          whenCount += s.split("WHEN").length - 1;
        }
        if (Array.isArray(o.values)) o.values.forEach(walk);
        return;
      }
      prims.push(x);
    };
    // Teks luar: arg pertama = array strings template (tanpa `.values`).
    if (Array.isArray(call[0])) text = call[0].join(" ");
    call.forEach(walk);
    if (!text.includes("purchase_order_items") || !text.includes("received_qty")) continue;
    const flat = prims.filter((v) => typeof v === "number");
    for (let i = 0; i < whenCount; i++) {
      writes.push({ id: flat[i * 2], value: flat[i * 2 + 1] });
    }
  }
  return writes;
}

/** Hitung statement UPDATE purchase_order_items dari mock (target: 1 batch). */
function receivedQtyStatementCount(spies: { executeRaw: { mock: { calls: unknown[][] } } }) {
  return spies.executeRaw.mock.calls.filter(
    (call) => Array.isArray(call[0]) && call[0].join(" ").includes("purchase_order_items"),
  ).length;
}

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  mocks.generateDocumentNumber.mockImplementation(async () => `SM-${++n}`);
  mocks.generateDocumentNumberBatch.mockImplementation(async (_k: string, count: number) =>
    Array.from({ length: count }, () => `SM-${++n}`),
  );
  mocks.createInLayer.mockResolvedValue(undefined);
  mocks.onGoodsReceipt.mockResolvedValue(undefined);
  mocks.onServiceGoodsReceipt.mockResolvedValue(undefined);
});

describe("onGoodsReceiptVerified menulis PurchaseOrderItem.receivedQty", () => {
  it("menulis kumulatif (penerimaan sebagian sebelumnya + sekarang)", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ id: 11, itemId: 7, qty: 10 }],
      priorGrItems: [{ itemId: 7, qty: 4 }],
      grItems: [{ itemId: 7, qty: 6, unitCost: 1000 }],
    });

    await onGoodsReceiptVerified(100, 1);

    expect(receivedQtyWrites(spies)).toEqual([{ value: 10, id: 11 }]);
  });

  it("menulis 0 untuk baris PO yang belum pernah diterima (nilai absolut)", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [
        { id: 11, itemId: 7, qty: 10 },
        { id: 12, itemId: 8, qty: 5 },
      ],
      priorGrItems: [],
      grItems: [{ itemId: 8, qty: 5, unitCost: 2000 }],
    });

    await onGoodsReceiptVerified(100, 1);

    expect(receivedQtyWrites(spies).sort((a, b) => Number(a.id) - Number(b.id))).toEqual([
      { value: 0, id: 11 },
      { value: 5, id: 12 },
    ]);
  });

  it("menulis dalam satuan BASIS saat baris penerimaan memakai UoM lain", async () => {
    // 1 BOX @ 12000 dengan faktor 12 = 12 PCS; PO memesan 12 PCS.
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ id: 11, itemId: 7, qty: 12 }],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 1, unitCost: 12000, uom: "BOX" }],
      conversions: [{ itemId: 7, code: "BOX", factorToBase: 12 }],
    });

    await onGoodsReceiptVerified(100, 1);

    expect(receivedQtyWrites(spies)).toEqual([{ value: 12, id: 11 }]);
  });

  it("tidak menulis apa pun bila penerimaan over-receipt (poin aksi ditolak)", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ id: 11, itemId: 7, qty: 10 }],
      priorGrItems: [{ itemId: 7, qty: 8 }],
      grItems: [{ itemId: 7, qty: 5 }],
    });

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/melebihi pesanan/);
    expect(receivedQtyWrites(spies)).toEqual([]);
  });

  it("PO duplikat 5+5 terima 6: per baris 5 lalu 1, tanpa over-receipt palsu", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [
        { id: 11, itemId: 7, qty: 5 },
        { id: 12, itemId: 7, qty: 5 },
      ],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 6, unitCost: 1000 }],
    });

    await onGoodsReceiptVerified(100, 1);

    // Total per item (6) didistribusikan per baris — bukan 6 di kedua baris.
    expect(receivedQtyWrites(spies).sort((a, b) => Number(a.id) - Number(b.id))).toEqual([
      { value: 5, id: 11 },
      { value: 1, id: 12 },
    ]);
    // Batch: seluruh baris PO ditulis dalam SATU statement, bukan per baris.
    expect(receivedQtyStatementCount(spies)).toBe(1);
    expect(spies.poUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "partial_received" } }),
    );
  });

  it("PO duplikat 5+5 terima 11 tetap ditolak (guard terhadap total PO)", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [
        { id: 11, itemId: 7, qty: 5 },
        { id: 12, itemId: 7, qty: 5 },
      ],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 11, unitCost: 1000 }],
    });

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/melebihi pesanan/);
    expect(receivedQtyWrites(spies)).toEqual([]);
  });

  it("menolak penerimaan item trackBatch tanpa nomor lot", async () => {
    const { spies } = wireTx({
      poId: 50,
      poItems: [{ id: 11, itemId: 7, qty: 10 }],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 6, unitCost: 1000 }],
      itemMeta: { unitOfMeasure: "PCS", trackBatch: true, trackSerial: false, isService: false },
    });

    await expect(onGoodsReceiptVerified(100, 1)).rejects.toThrow(/batch/);
    expect(spies.moveCreate).not.toHaveBeenCalled();
  });

  it("tidak menyentuh baris PO bila penerimaan tidak terkait PO", async () => {
    const { spies } = wireTx({
      poId: null,
      poItems: [],
      priorGrItems: [],
      grItems: [{ itemId: 7, qty: 1 }],
    });

    await onGoodsReceiptVerified(100, 1);

    expect(receivedQtyWrites(spies)).toEqual([]);
    expect(spies.poItemFindMany).not.toHaveBeenCalled();
  });
});
