import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteGoodsReceipt, verifyGoodsReceipt } from "../purchase.actions";

// Regression: create/update GR assert warehouse scope, but delete/verify did not.
// Warehouse-scoped user (assigned gudang 1) could delete/verify GR gudang 2 by id,
// reversing stock + journal outside their authority.
const mocks = vi.hoisted(() => {
  const txMock: any = {
    stockMove: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
    inventoryLayer: { deleteMany: vi.fn(), count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    itemBatch: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    purchaseOrderItem: { findMany: vi.fn().mockResolvedValue([]) },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    uomConversion: { findMany: vi.fn().mockResolvedValue([]) },
    goodsReceiptItem: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    goodsReceipt: { delete: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    purchaseOrder: { update: vi.fn() },
    itemSerial: { deleteMany: vi.fn() },
    $executeRaw: vi.fn(),
    journal: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prismaMock: any = {
    goodsReceipt: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 9,
        purchaseOrderId: 10,
        warehouseId: 2,
        status: "draft",
        slug: "gr-9",
        items: [{ warehouseId: 2 }],
      }),
    },
    vendorBill: { count: vi.fn().mockResolvedValue(0) },
    userWarehouse: { findMany: vi.fn().mockResolvedValue([{ warehouseId: 1 }]) },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(txMock);
      return Promise.all(ops);
    }),
  };
  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 7, roles: ["warehouse"] }),
    prismaMock,
    txMock,
    onVerifiedMock: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/hooks/goods-receipt.hook", () => ({ onGoodsReceiptVerified: mocks.onVerifiedMock }));
vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { notifyAdmins: vi.fn() },
}));

describe("goodsReceipt warehouse scope (delete/verify)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["warehouse"] });
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 1 }]);
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({
      id: 9,
      purchaseOrderId: 10,
      warehouseId: 2,
      status: "draft",
      slug: "gr-9",
      items: [{ warehouseId: 2 }],
    });
    mocks.prismaMock.vendorBill.count.mockResolvedValue(0);
  });

  it("deleteGoodsReceipt menolak GR gudang lain tanpa transaksi hapus", async () => {
    const res: any = await deleteGoodsReceipt(9);
    expect(res.success).toBe(false);
    expect(res.error).toContain("gudang");
    expect(mocks.prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("verifyGoodsReceipt menolak GR gudang lain tanpa hook verifikasi", async () => {
    const res: any = await verifyGoodsReceipt(9);
    expect(res.success).toBe(false);
    expect(res.error).toContain("gudang");
    expect(mocks.onVerifiedMock).not.toHaveBeenCalled();
  });

  it("deleteGoodsReceipt tetap sukses untuk admin (akses semua gudang)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] });
    const res: any = await deleteGoodsReceipt(9);
    expect(res.success).toBe(true);
  });
});
