import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteGoodsReceipt } from "../purchase.actions";

/**
 * Akumulator `PurchaseOrderItem.receivedQty` harus TURUN saat penerimaan
 * terverifikasi dihapus. Sebelumnya kolom ini tidak pernah ditulis sama sekali;
 * setelah hook penerimaan menulisnya, jalur pembatalan/pengurangan wajib
 * menghitung ulang — kalau tidak, laporan PO Outstanding terus menghitung stok
 * yang sudah tidak ada sebagai "Diterima".
 */

const mocks = vi.hoisted(() => {
  const txMock: any = {
    stockMove: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
    inventoryLayer: {
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    itemBatch: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    purchaseOrderItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    item: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    uomConversion: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    goodsReceiptItem: {
      deleteMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    goodsReceipt: {
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    purchaseOrder: {
      update: vi.fn(),
    },
    itemSerial: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    journal: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };

  const prismaMock: any = {
    goodsReceipt: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, purchaseOrderId: 10, items: [] }),
    },
    vendorBill: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(txMock);
      return Promise.all(ops);
    }),
  };

  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1, roles: ["super_admin"] }),
    prismaMock,
    txMock,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));

/** Panggilan $executeRaw penulisan received_qty PER BARIS PO (nilai, id baris). */
function receivedQtyWrites() {
  return mocks.txMock.$executeRaw.mock.calls
    .filter((call: unknown[]) => {
      const sql = Array.isArray(call[0]) ? (call[0] as string[]).join("") : String(call[0]);
      return sql.includes("purchase_order_items") && sql.includes("received_qty");
    })
    .map((call: unknown[]) => call.slice(1));
}

describe("deleteGoodsReceipt menghitung ulang receivedQty PO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] });
    // PUR-BR-010: hanya GR draft boleh dihapus — fixture wajib draft eksplisit.
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      purchaseOrderId: 10,
      warehouseId: 5,
      status: "draft",
      items: [],
    });
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0);
    mocks.txMock.goodsReceipt.count.mockResolvedValue(0);
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValue([]);
  });

  it("menjalankan rekomputasi dari penerimaan yang tersisa, per PO", async () => {
    // PO memuat item 7 dua kali (5 + 10); penerimaan tersisa berjumlah 6 →
    // per baris 5 lalu 1 (bukan total 6 yang sama di kedua baris).
    mocks.txMock.purchaseOrderItem.findMany.mockResolvedValue([
      { id: 11, itemId: 7, qty: 5 },
      { id: 12, itemId: 7, qty: 10 },
    ]);
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValue([{ itemId: 7, qty: 6, uom: null }]);
    mocks.txMock.item.findMany.mockResolvedValue([{ id: 7, unitOfMeasure: "PCS" }]);

    const res = await deleteGoodsReceipt(1);

    expect(res?.success).toBe(true);
    expect(receivedQtyWrites()).toEqual([
      [5, 11],
      [1, 12],
    ]);
    // Hanya penerimaan terverifikasi/selesai yang tersisa yang dihitung.
    expect(mocks.txMock.goodsReceiptItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          goodsReceipt: expect.objectContaining({
            purchaseOrderId: 10,
            status: { in: ["verified", "completed"] },
          }),
        }),
      }),
    );
  });

  it("menjalankan rekomputasi SESUDAH baris penerimaan dihapus", async () => {
    mocks.txMock.purchaseOrderItem.findMany.mockResolvedValue([{ id: 11, itemId: 7, qty: 10 }]);

    await deleteGoodsReceipt(1);

    const deleteOrder = mocks.txMock.goodsReceiptItem.deleteMany.mock.invocationCallOrder[0];
    const writeIdx = mocks.txMock.$executeRaw.mock.calls.findIndex((call: unknown[]) => {
      const sql = Array.isArray(call[0]) ? (call[0] as string[]).join("") : String(call[0]);
      return sql.includes("purchase_order_items") && sql.includes("received_qty");
    });
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    const recomputeOrder = mocks.txMock.$executeRaw.mock.invocationCallOrder[writeIdx];
    expect(recomputeOrder).toBeGreaterThan(deleteOrder);
  });

  it("tetap mengembalikan status PO ke ordered saat penerimaan terakhir dihapus", async () => {
    await deleteGoodsReceipt(1);

    expect(mocks.txMock.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { status: "ordered" },
    });
  });

  it("tidak menyentuh baris PO bila penerimaannya tidak terkait PO", async () => {
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 2,
      purchaseOrderId: null,
      warehouseId: 5,
      status: "draft",
      items: [],
    });

    const res = await deleteGoodsReceipt(2);

    expect(res?.success).toBe(true);
    expect(receivedQtyWrites()).toHaveLength(0);
  });
});
