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
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    prismaMock,
    txMock,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));

/** Panggilan $executeRaw yang merupakan rekomputasi received_qty. */
function receivedQtyRecompute(call: unknown[]) {
  const sql = Array.isArray(call[0]) ? (call[0] as string[]).join("") : String(call[0]);
  return (
    sql.includes("purchase_order_items") &&
    sql.includes("received_qty") &&
    sql.includes("goods_receipt_items")
  );
}

describe("deleteGoodsReceipt menghitung ulang receivedQty PO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 1 });
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      purchaseOrderId: 10,
      items: [],
    });
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0);
    mocks.txMock.goodsReceipt.count.mockResolvedValue(0);
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValue([]);
  });

  it("menjalankan rekomputasi dari penerimaan yang tersisa, per PO", async () => {
    const res = await deleteGoodsReceipt(1);

    expect(res?.success).toBe(true);
    const calls = mocks.txMock.$executeRaw.mock.calls.filter(receivedQtyRecompute);
    expect(calls).toHaveLength(1);
    // PO + status yang dihitung: hanya penerimaan terverifikasi/selesai yang tersisa.
    expect(calls[0].slice(1)).toEqual([10, "verified", "completed", 10]);
  });

  it("menjalankan rekomputasi SESUDAH baris penerimaan dihapus", async () => {
    await deleteGoodsReceipt(1);

    const deleteOrder = mocks.txMock.goodsReceiptItem.deleteMany.mock.invocationCallOrder[0];
    const recomputeCall = mocks.txMock.$executeRaw.mock.calls.find(receivedQtyRecompute)!;
    const recomputeOrder =
      mocks.txMock.$executeRaw.mock.invocationCallOrder[
        mocks.txMock.$executeRaw.mock.calls.indexOf(recomputeCall)
      ];
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
      items: [],
    });

    const res = await deleteGoodsReceipt(2);

    expect(res?.success).toBe(true);
    expect(mocks.txMock.$executeRaw.mock.calls.filter(receivedQtyRecompute)).toHaveLength(0);
  });
});
