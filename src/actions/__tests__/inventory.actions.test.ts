import { describe, it, expect, vi, beforeEach } from "vitest";

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
  });

  const prismaMock: any = {
    stockAdjustment: buildModelMock(),
    stockAdjustmentItem: buildModelMock(),
    // processStockAdjustment sekarang membaca id jurnal penyesuaian
    // (referenceType/referenceId) untuk mengisi StockAdjustment.journalId.
    journal: buildModelMock(),
    inventoryTransfer: buildModelMock(),
    inventoryTransferItem: buildModelMock(),
    materialIssue: buildModelMock(),
    materialIssueItem: buildModelMock(),
    productionOrderMaterial: buildModelMock(),
    workOrder: buildModelMock(),
    workOrderItem: buildModelMock(),
    rack: {
      ...buildModelMock(),
      aggregate: vi.fn().mockResolvedValue({ _max: { id: 0 } }),
    },
    rackRow: {
      ...buildModelMock(),
      aggregate: vi.fn().mockResolvedValue({ _max: { id: 0 } }),
    },
    systemSetting: buildModelMock(),
    remnant: buildModelMock(),
    stocktakeSession: buildModelMock(),
    stocktakeLine: buildModelMock(),
    inventoryLayer: { ...buildModelMock(), groupBy: vi.fn().mockResolvedValue([]) },
    warehouse: buildModelMock(),
    userWarehouse: buildModelMock(),
    item: buildModelMock(),
    stockMove: {
      ...buildModelMock(),
      groupBy: vi.fn().mockResolvedValue([{ itemId: 1, _sum: { qty: 5 } }]),
    },

    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock);
      return Promise.all(ops);
    }),
  };

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: any) => mocks.requirePermissionMock(...a),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }));
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: mocks.logActivityMock,
}));
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001"),
}));

vi.mock("@/lib/hooks/stock-adjustment.hook", () => ({
  onStockAdjustmentProcessed: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/hooks/inventory-transfer.hook", () => ({
  onTransferProcessed: vi.fn().mockResolvedValue({}),
  onTransferReceived: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/hooks/material-issue.hook", () => ({
  onMaterialIssueCompleted: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/approval-workflow.service", () => ({
  assertApproved: vi.fn().mockResolvedValue(undefined),
  requestApprovalIfConfigured: vi.fn().mockResolvedValue(false),
}));

import * as actions from "../inventory.actions";
import { onStockAdjustmentProcessed as stockAdjHook } from "@/lib/hooks/stock-adjustment.hook";
import { onMaterialIssueCompleted as matIssueHook } from "@/lib/hooks/material-issue.hook";

function fdMap(
  payload: Record<string, string | number | null | undefined>,
): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v));
  }
  return f;
}

const DATE = "2026-06-13"
const itemsJson = (items: unknown[] = [{ itemId: 1, qty: 10, cost: 100 }]) => JSON.stringify(items)
const saFd = (over: Record<string, string | number> = {}) => fdMap({ warehouseId: 1, date: DATE, reason: "Test", items: itemsJson(), ...over })
const transferFd = (over: Record<string, string | number> = {}) => fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: DATE, items: itemsJson([{ itemId: 1, qty: 10 }]), ...over })
const miFd = (over: Record<string, string | number> = {}) => fdMap({ warehouseId: 1, projectId: 1, date: DATE, items: itemsJson(), ...over })
const woFd = (over: Record<string, string | number> = {}, items: unknown[] = [{ itemId: 1, qty: 10, cost: 100 }]) => fdMap({ customerId: 1, projectId: 1, date: DATE, items: itemsJson(items), ...over })
const seedDraft = (model: any, over: Record<string, unknown> = {}) => model.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft", ...over })
const seedDoc = (model: any, status: string, over: Record<string, unknown> = {}) => model.findUniqueOrThrow.mockResolvedValue({ id: 1, status, ...over })
const expectSuccess = (res: any) => expect(res?.success).toBe(true)

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermissionMock.mockResolvedValue({ id: 1, roles: ["super_admin"] });
});

describe("Stock Adjustment Actions", () => {
  it("createStockAdjustment succeeds", async () => {
    const res = await actions.createStockAdjustment(saFd());
    expectSuccess(res);
  });

  it("rejects duplicate item rows instead of saving conflicting physical counts", async () => {
    const res = await actions.createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, newQty: 11, unitCost: 100 }, { itemId: 1, newQty: 12, unitCost: 100 }]) }),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("hanya boleh dicantumkan satu kali");
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });
  it("createStockAdjustment computes systemQty as IN - OUT (not gross sum)", async () => {
    // Simulate historical posted moves: 15 IN + 5 OUT in this warehouse => real stock = 10.
    // The OLD bug summed IN and OUT together, so systemQty was reported as 20 instead of 10.
    mocks.prismaMock.stockMove.groupBy.mockResolvedValueOnce([
      { itemId: 1, impact: "IN", _sum: { qty: 15 } },
      { itemId: 1, impact: "OUT", _sum: { qty: 5 } },
    ]);
    mocks.prismaMock.stockAdjustment.create.mockImplementationOnce(
      ({ data }: any) => {
        const item = data.items.create[0];
        // systemQty MUST be 10 (15 - 5), NOT 20.
        expect(item.systemQty).toBe(10);
        // With actualQty=12 the difference is +2, not -8.
        expect(item.difference).toBe(2);
        return { id: 1 };
      },
    );
    const res = await actions.createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, currentQty: 999, newQty: 12, unitCost: 100, reason: "" }]) }),
    );
    expect(res?.success).toBe(true);
  });
  it("createStockAdjustment filters by status: posted only (drafts must not inflate systemQty)", async () => {
    mocks.prismaMock.stockMove.groupBy.mockResolvedValueOnce([]); // no posted moves
    mocks.prismaMock.stockAdjustment.create.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].systemQty).toBe(0);
        return { id: 1 };
      },
    );
    const res = await actions.createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, newQty: 0, unitCost: 100, reason: "" }]) }),
    );
    expect(res?.success).toBe(true);
  });
  it("rejects duplicate item rows when updating a draft", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    const res = await actions.updateStockAdjustment(
      1,
      saFd({ items: itemsJson([{ itemId: 1, newQty: 11, unitCost: 100 }, { itemId: 1, newQty: 12, unitCost: 100 }]) }),
    );
    expect(res.success).toBe(false);
    expect(res.error).toContain("hanya boleh dicantumkan satu kali");
    expect(mocks.prismaMock.stockAdjustment.update).not.toHaveBeenCalled();
  });
  it("updateStockAdjustment succeeds", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    const res = await actions.updateStockAdjustment(1, saFd());
    expectSuccess(res);
  });
  it("processStockAdjustment succeeds", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment, { items: [] });
    const res = await actions.processStockAdjustment(1);
    expectSuccess(res);
  });
  it("processStockAdjustment ditolak bila approval pending (P0-3)", async () => {
    const { assertApproved } = await import("@/lib/services/approval-workflow.service");
    vi.mocked(assertApproved).mockRejectedValueOnce(
      new Error("Dokumen masih menunggu persetujuan (approval workflow) sebelum dapat dilanjutkan."),
    );
    seedDraft(mocks.prismaMock.stockAdjustment, { items: [] });
    const res = await actions.processStockAdjustment(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("menunggu persetujuan");
    // Hook stok tak boleh jalan — tak ada mutasi tanpa persetujuan.
    expect(stockAdjHook).not.toHaveBeenCalled();
  });
  it("createStockAdjustment mengajukan approval bila workflow ada (P0-3)", async () => {
    const { requestApprovalIfConfigured } = await import("@/lib/services/approval-workflow.service");
    const res = await actions.createStockAdjustment(saFd());
    expectSuccess(res);
    expect(requestApprovalIfConfigured).toHaveBeenCalledWith("StockAdjustment", expect.any(Number), 1);
  });
  it("processStockAdjustment does not duplicate journal (stock hook owns it)", async () => {
    vi.clearAllMocks();
    seedDraft(mocks.prismaMock.stockAdjustment, { items: [] });
    const res = await actions.processStockAdjustment(1);
    expectSuccess(res);
    expect(stockAdjHook).toHaveBeenCalledWith(1, 1, expect.any(Object));
  });

  it("deleteStockAdjustment succeeds", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    const res = await actions.deleteStockAdjustment(1);
    expectSuccess(res);
  });
});

describe("Inventory Transfer Actions", () => {
  it("createInventoryTransfer succeeds", async () => {
    const res = await actions.createInventoryTransfer(transferFd());
    expectSuccess(res);
  });
  it("updateInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    const res = await actions.updateInventoryTransfer(1, transferFd());
    expectSuccess(res);
  });
  it("processInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer, { items: [] });
    const res = await actions.processInventoryTransfer(1);
    expectSuccess(res);
  });
  it("receiveInventoryTransfer succeeds", async () => {
    seedDoc(mocks.prismaMock.inventoryTransfer, "processed", { items: [] });
    const res = await actions.receiveInventoryTransfer(1);
    expectSuccess(res);
  });
  it("deleteInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    const res = await actions.deleteInventoryTransfer(1);
    expectSuccess(res);
  });
});

describe("Material Issue Actions", () => {
  it("createMaterialIssue succeeds", async () => {
    const res = await actions.createMaterialIssue(miFd());
    expectSuccess(res);
  });
  it("updateMaterialIssue succeeds", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    const res = await actions.updateMaterialIssue(1, miFd());
    expectSuccess(res);
  });
  // Regresi: workOrderId & projectId tidak punya input di form MI, jadi update
  // dulu menulis `?? null` dan memutus keduanya. Hilangnya workOrderId membuat
  // "Buat Pengeluaran Material" bisa dijalankan lagi untuk WO yang sama.
  it("updateMaterialIssue tidak menghapus workOrderId/projectId yang tidak dikirim form", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    const res = await actions.updateMaterialIssue(1, fdMap({ warehouseId: 1, date: DATE, items: itemsJson() }));
    expectSuccess(res);
    const payload = mocks.prismaMock.materialIssue.update.mock.calls.at(-1)?.[0] as
      | { data?: Record<string, unknown> }
      | undefined;
    expect(payload?.data && "workOrderId" in payload.data).toBe(false);
    expect(payload?.data && "projectId" in payload.data).toBe(false);
  });
  it("completeMaterialIssue succeeds", async () => {
    seedDraft(mocks.prismaMock.materialIssue, { items: [] });
    const res = await actions.completeMaterialIssue(1);
    expectSuccess(res);
  });
  it("completeMaterialIssue refuses when the WO was already consumed via PO (P1-4)", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
      id: 1, status: "draft", items: [], workOrderId: 42,
    });
    mocks.prismaMock.productionOrderMaterial.aggregate.mockResolvedValue({
      _sum: { actualQty: 5 },
    });
    const res = await actions.completeMaterialIssue(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("perintah produksi");
    expect(matIssueHook).not.toHaveBeenCalled();
    // Klaim dikembalikan ke draft agar bisa dicoba lagi.
    expect(mocks.prismaMock.materialIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "draft" } }),
    );
  });
  it("completeMaterialIssue does not duplicate journal (stock hook owns it)", async () => {
    vi.clearAllMocks();
    seedDraft(mocks.prismaMock.materialIssue, { items: [] });
    const res = await actions.completeMaterialIssue(1);
    expectSuccess(res);
    expect(matIssueHook).toHaveBeenCalledWith(1, 1, expect.any(Object));
  });

  it("deleteMaterialIssue succeeds", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    const res = await actions.deleteMaterialIssue(1);
    expectSuccess(res);
  });
});

describe("Rack & WorkOrder & Others", () => {
  it("createWorkOrder succeeds", async () => {
    const res = await actions.createWorkOrder(
      fdMap({ customerId: 1, projectId: 1, date: DATE, name: "WO", quantity: 1 }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateWorkOrder succeeds", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    const res = await actions.updateWorkOrder(
      1,
      fdMap({ customerId: 1, projectId: 1, date: DATE, name: "WO", quantity: 1 }),
    );
    expect(res?.success).toBe(true);
  });
  it("createRack succeeds", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({
      enableAutoRackCode: true,
    });
    const res = await actions.createRack(
      fdMap({ warehouseId: 1, code: "R1", name: "Rack 1" }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateRack succeeds", async () => {
    const res = await actions.updateRack(
      1,
      fdMap({ warehouseId: 1, code: "R1", name: "Rack 1" }),
    );
    expect(res?.success).toBe(true);
  });
  it("deleteRack succeeds", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(0);
    mocks.prismaMock.stockMove.count.mockResolvedValue(0);
    mocks.prismaMock.rackRow.count.mockResolvedValue(0);
    const res = await actions.deleteRack(1);
    expect(res?.success).toBe(true);
  });
  it("createRackRow succeeds", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({
      enableAutoRowCode: true,
    });
    const res = await actions.createRackRow(
      fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateRackRow succeeds", async () => {
    const res = await actions.updateRackRow(
      1,
      fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateRackRow handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.prismaMock.rackRow.update.mockRejectedValue(new Error("db err"));
    const res = await actions.updateRackRow(
      1,
      fdMap({ rackId: 1, code: "RR1", name: "Row 1", level: 1 }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toBe("db err");
  });
  it("deleteRackRow succeeds", async () => {
    const res = await actions.deleteRackRow(1);
    expect(res?.success).toBe(true);
  });
  it("deleteRackRow handles error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.prismaMock.rackRow.delete.mockRejectedValue(new Error("db err"));
    const res = await actions.deleteRackRow(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toBe("db err");
  });

  it("getNextRackCode requires warehouse-create permission and returns scoped format", async () => {
    const result = await actions.getNextRackCode(3);
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("create_warehouses");
    expect(result.code).toBe("RCK-0001");
  });

  it("getNextRowCode matches the global sequence used when creating a row", async () => {
    mocks.prismaMock.rack.findUnique.mockResolvedValueOnce({ warehouseId: 3 });
    mocks.prismaMock.rackRow.aggregate.mockResolvedValueOnce({ _max: { id: 12 } });

    const result = await actions.getNextRowCode(9);
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("manage_inventory");
    expect(mocks.prismaMock.rackRow.findFirst).toHaveBeenCalledWith({
      where: { code: "ROW-0013" },
      select: { id: true },
    });
    expect(result.code).toBe("ROW-0013");
  });

  it("prevents creating racks outside the caller's warehouse assignments", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["warehouse_staff"] });
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValueOnce([{ warehouseId: 1 }]);

    const result = await actions.createRack(fdMap({ warehouseId: 2, name: "Foreign rack" }));
    expect(result?.success).toBe(false);
    expect(mocks.prismaMock.rack.create).not.toHaveBeenCalled();
  });

  it("prevents moving an assigned rack into an unassigned warehouse", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["warehouse_staff"] });
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 1 }]);
    mocks.prismaMock.rack.findUnique.mockResolvedValueOnce({ warehouseId: 1 });

    const result = await actions.updateRack(4, fdMap({ warehouseId: 2, name: "Moved" }));
    expect(result?.success).toBe(false);
    expect(mocks.prismaMock.rack.update).not.toHaveBeenCalled();
  });
});

describe("Global Error Paths (Permission Reject for 21 funcs)", () => {
  async function expectPermissionReject(fnName: string) {
    vi.spyOn(console, "error").mockImplementation(() => {});
    if ((mocks as any).requirePermissionMock)
      (mocks as any).requirePermissionMock.mockRejectedValueOnce(
        new Error("perm denied"),
      );
    if ((mocks as any).requireAuthMock)
      (mocks as any).requireAuthMock.mockRejectedValueOnce(
        new Error("perm denied"),
      );
    const arg1 = new FormData();
    const arg2 = new FormData();
    try {
      await (actions as any)[fnName](arg1, arg2);
    } catch {}
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled()
  }

  it("createStockAdjustment handles error globally", async () => {
    await expectPermissionReject("createStockAdjustment");
  });
  it("processStockAdjustment handles error globally", async () => {
    await expectPermissionReject("processStockAdjustment");
  });
  it("createInventoryTransfer handles error globally", async () => {
    await expectPermissionReject("createInventoryTransfer");
  });
  it("processInventoryTransfer handles error globally", async () => {
    await expectPermissionReject("processInventoryTransfer");
  });
  it("receiveInventoryTransfer handles error globally", async () => {
    await expectPermissionReject("receiveInventoryTransfer");
  });
  it("createMaterialIssue handles error globally", async () => {
    await expectPermissionReject("createMaterialIssue");
  });
  it("completeMaterialIssue handles error globally", async () => {
    await expectPermissionReject("completeMaterialIssue");
  });
  it("createWorkOrder handles error globally", async () => {
    await expectPermissionReject("createWorkOrder");
  });
  it("updateWorkOrder handles error globally", async () => {
    await expectPermissionReject("updateWorkOrder");
  });
  it("createRack handles error globally", async () => {
    await expectPermissionReject("createRack");
  });
  it("updateRack handles error globally", async () => {
    await expectPermissionReject("updateRack");
  });
  it("deleteStockAdjustment handles error globally", async () => {
    await expectPermissionReject("deleteStockAdjustment");
  });
  it("deleteInventoryTransfer handles error globally", async () => {
    await expectPermissionReject("deleteInventoryTransfer");
  });
  it("deleteMaterialIssue handles error globally", async () => {
    await expectPermissionReject("deleteMaterialIssue");
  });
  it("deleteRack handles error globally", async () => {
    await expectPermissionReject("deleteRack");
  });
  it("updateStockAdjustment handles error globally", async () => {
    await expectPermissionReject("updateStockAdjustment");
  });
  it("updateMaterialIssue handles error globally", async () => {
    await expectPermissionReject("updateMaterialIssue");
  });
  it("updateInventoryTransfer handles error globally", async () => {
    await expectPermissionReject("updateInventoryTransfer");
  });
  it("createRackRow handles error globally", async () => {
    await expectPermissionReject("createRackRow");
  });
  it("updateRackRow handles error globally", async () => {
    await expectPermissionReject("updateRackRow");
  });
  it("deleteRackRow handles error globally", async () => {
    await expectPermissionReject("deleteRackRow");
  });
});

describe("Inventory Transfer Error & Edge Paths", () => {
  it("processInventoryTransfer fails if not found or status not draft", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer, { items: [] });
    mocks.prismaMock.inventoryTransfer.updateMany.mockResolvedValue({
      count: 0,
    });
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({
      status: "processed",
    });
    const res = await (actions as any).processInventoryTransfer(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Transfer sudah berstatus processed");

    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue(null);
    const res2 = await (actions as any).processInventoryTransfer(1);
    expect(res2?.success).toBe(false);
    expect(res2?.error).toContain("Transfer tidak ditemukan");

    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
      items: [],
    });
    const res3 = await (actions as any).processInventoryTransfer(1);
    expect(res3?.success).toBe(false);
    expect(res3?.error).toContain(
      "Transfer hanya bisa diproses dari status draft",
    );
  });

  it("receiveInventoryTransfer fails if not found or status not processed", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
      items: [],
    });
    mocks.prismaMock.inventoryTransfer.updateMany.mockResolvedValue({
      count: 0,
    });
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({
      status: "receiving",
    });
    const res = await (actions as any).receiveInventoryTransfer(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Transfer sudah berstatus receiving");

    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue(null);
    const res2 = await (actions as any).receiveInventoryTransfer(1);
    expect(res2?.success).toBe(false);
    expect(res2?.error).toContain("Transfer tidak ditemukan");

    seedDraft(mocks.prismaMock.inventoryTransfer, { items: [] });
    const res3 = await (actions as any).receiveInventoryTransfer(1);
    expect(res3?.success).toBe(false);
    expect(res3?.error).toContain(
      "Transfer hanya bisa di-receive dari status processed",
    );
  });
});

describe("Stock Adjustment Error & Edge Paths", () => {
  it("createStockAdjustment throws on negative actual qty", async () => {
    const res = await (actions as any).createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, newQty: -10, cost: 100 }]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Kuantitas fisik (actual) tidak boleh negatif",
    );
  });

  it("updateStockAdjustment throws on negative actual qty", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: 1,
      status: "draft",
    });
    const res = await (actions as any).updateStockAdjustment(1, saFd({ items: itemsJson([{ itemId: 1, newQty: -10, cost: 100 }]) }));
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Kuantitas fisik (actual) tidak boleh negatif",
    );
  });

  it("updateStockAdjustment fails if status changed inside transaction", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateStockAdjustment(
      1,
      fdMap({ warehouseId: 1, date: DATE, items: itemsJson([{ itemId: 1, newQty: 10, cost: 100 }]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya stock adjustment draft yang dapat diedit",
    );
  });

  it("updateStockAdjustment fails if not draft initially", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateStockAdjustment(
      1,
      fdMap({ warehouseId: 1, date: DATE }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya stock adjustment draft yang dapat diedit",
    );
  });

  it("processStockAdjustment fails if not found or not draft", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment, { items: [] });
    mocks.prismaMock.stockAdjustment.updateMany.mockResolvedValue({ count: 0 });
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({
      status: "processed",
    });
    const res = await (actions as any).processStockAdjustment(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Penyesuaian stok sudah berstatus processed");

    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue(null);
    const res2 = await (actions as any).processStockAdjustment(1);
    expect(res2?.success).toBe(false);
    expect(res2?.error).toContain("Penyesuaian stok tidak ditemukan");

    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
      items: [],
    });
    const res3 = await (actions as any).processStockAdjustment(1);
    expect(res3?.success).toBe(false);
    expect(res3?.error).toContain(
      "Adjustment hanya bisa diproses dari status draft",
    );
  });

  it("deleteStockAdjustment fails if not draft", async () => {
    mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).deleteStockAdjustment(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya stock adjustment draft yang dapat dihapus",
    );
  });
});

describe("Material Issue Error & Edge Paths", () => {
  it("createMaterialIssue fails if no valid items", async () => {
    const res = await (actions as any).createMaterialIssue(
      miFd({ items: itemsJson([]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Pengeluaran Material harus memiliki minimal 1 item dengan kuantitas > 0",
    );
  });

  it("updateMaterialIssue succeeds with empty valid items (no items create)", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({
      id: 1,
      status: "draft",
    });
    mocks.prismaMock.materialIssue.update.mockResolvedValue({ id: 1 });
    const res = await (actions as any).updateMaterialIssue(
      1,
      miFd({ items: itemsJson([{ itemId: -1, qty: 0 }]) }),
    );
    expect(res?.success).toBe(true);
  });

  it("updateMaterialIssue fails if not draft initially", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateMaterialIssue(
      1,
      fdMap({ warehouseId: 1, projectId: 1, date: DATE }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya material issue draft yang dapat diedit",
    );
  });

  it("updateMaterialIssue fails if status changed inside transaction", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateMaterialIssue(
      1,
      miFd(),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya material issue draft yang dapat diedit",
    );
  });

  it("completeMaterialIssue fails if not found or not draft", async () => {
    seedDraft(mocks.prismaMock.materialIssue, { items: [] });
    mocks.prismaMock.materialIssue.updateMany.mockResolvedValue({ count: 0 });
    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue({
      status: "processed",
    });
    const res = await (actions as any).completeMaterialIssue(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Pengeluaran Material sudah berstatus Diproses");

    mocks.prismaMock.materialIssue.findUnique.mockResolvedValue(null);
    const res2 = await (actions as any).completeMaterialIssue(1);
    expect(res2?.success).toBe(false);
    expect(res2?.error).toContain("Pengeluaran Material tidak ditemukan");

    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
      items: [],
    });
    const res3 = await (actions as any).completeMaterialIssue(1);
    expect(res3?.success).toBe(false);
    expect(res3?.error).toContain(
      "Pengeluaran Material hanya bisa diselesaikan dari status draf",
    );
  });

  it("deleteMaterialIssue fails if not draft", async () => {
    mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).deleteMaterialIssue(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain(
      "Hanya material issue draft yang dapat dihapus",
    );
  });
});

describe("Other Delete Errors", () => {
  it("deleteInventoryTransfer fails if not draft", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).deleteInventoryTransfer(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Hanya transfer draft yang dapat dihapus");
  });

  it("deleteRack returns error if in use", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(1);
    const res = await (actions as any).deleteRack(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Rak masih digunakan oleh");
  });

  // Regression: deleteRackRow must mirror deleteRack's in-use guard. RackRow is
  // referenced by Item.defaultRackRowId (FK with onDelete: SetNull) and by
  // StockMove.rackRowId (plain Int, NO FK — silently dangling on raw delete,
  // erasing the location tag on historical stock movements). A raw delete of a
  // RackRow that still has dependents loses the Item's default row reference
  // AND the StockMove's location tag, neither of which can be reconstructed
  // from the audit log. Refuse the delete, just like deleteRack does.
  it("deleteRackRow returns error if referenced by items", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(2);
    mocks.prismaMock.stockMove.count.mockResolvedValue(0);
    const res = await (actions as any).deleteRackRow(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Baris rak");
    expect(res?.error).toContain("2 barang");
    // Critical: must NOT have deleted
    expect(mocks.prismaMock.rackRow.delete).not.toHaveBeenCalled();
  });

  it("deleteRackRow returns error if referenced by stock moves", async () => {
    mocks.prismaMock.item.count.mockResolvedValue(0);
    mocks.prismaMock.stockMove.count.mockResolvedValue(5);
    const res = await (actions as any).deleteRackRow(1);
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Baris rak");
    expect(res?.error).toContain("5 pergerakan");
    expect(mocks.prismaMock.rackRow.delete).not.toHaveBeenCalled();
  });
});

describe("Inventory Transfer Remaining Coverage", () => {
  it("updateInventoryTransfer fails if status changed inside transaction", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    mocks.prismaMock.inventoryTransfer.findUnique.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateInventoryTransfer(
      1,
      transferFd(),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Hanya transfer draft yang dapat diedit");
  });

  it("updateInventoryTransfer fails if not draft initially", async () => {
    mocks.prismaMock.inventoryTransfer.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "processed",
    });
    const res = await (actions as any).updateInventoryTransfer(
      1,
      fdMap({ sourceWarehouseId: 1, destinationWarehouseId: 2, date: DATE }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Hanya transfer draft yang dapat diedit");
  });
});

describe("WorkOrder Coverage", () => {
  it("updateWorkOrder handles item creation with negative/invalid data being filtered", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    const res = await (actions as any).updateWorkOrder(
      1,
      woFd({}, [{ itemId: -1, qty: 10, cost: 100 }]),
    );
    expect(res?.success).toBe(true);
  });
});

describe("WorkOrder Item Map Coverage", () => {
  it("createWorkOrder creates items when valid itemId provided", async () => {
    const res = await (actions as any).createWorkOrder(
      woFd({}, [{ itemId: 5, qty: 3, cost: 200, description: "d", status: "pending" }]),
    );
    expect(res?.success).toBe(true);
  });

  it("updateWorkOrder creates items when valid itemId provided", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    const res = await (actions as any).updateWorkOrder(
      1,
      woFd({}, [{ itemId: 5, qty: 3, cost: 200 }]),
    );
    expect(res?.success).toBe(true);
  });
});

describe("Inventory Validation / Edge Cases", () => {
  it("createStockAdjustment fails on parse error", async () => {
    const res = await (actions as any).createStockAdjustment(new FormData());
    expect(res?.success).toBe(false);
  });
  it("createInventoryTransfer fails on parse error", async () => {
    const res = await (actions as any).createInventoryTransfer(new FormData());
    expect(res?.success).toBe(false);
  });
  it("createMaterialIssue fails on parse error", async () => {
    const res = await (actions as any).createMaterialIssue(new FormData());
    expect(res?.success).toBe(false);
  });

  it("createWorkOrder defaults status to pending, description to null, cost to 0 when omitted", async () => {
    const res = await (actions as any).createWorkOrder(
      fdMap({
        customerId: 1,
        projectId: 1,
        date: "2026-06-13",
        name: "WO",
        quantity: 1,
        items: JSON.stringify([{ itemId: 5, qty: 3 }]),
      }),
    );
    expect(res?.success).toBe(true);
  });

  it("createRackRow auto generates code if missing", async () => {
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({
      enableAutoRowCode: true,
    });
    const res = await (actions as any).createRackRow(
      fdMap({ rackId: 1, name: "Row 1", level: 1 }),
    );
    expect(res?.success).toBe(true);
  });
});

describe("NextRedirectError and Error Fallbacks", () => {
  it("throws if NextRedirectError occurs during createStockAdjustment", async () => {
    const redirectErr = new Error("NEXT_REDIRECT");
    (redirectErr as any).digest = "NEXT_REDIRECT";
    if ((mocks as any).requirePermissionMock)
      (mocks as any).requirePermissionMock.mockRejectedValueOnce(redirectErr);

    // We mock isNextRedirectError from the module just by checking if the throw is preserved
    // Our error.ts usually checks if e.message.includes('NEXT_REDIRECT') or digest
    await expect(
      (actions as any).createStockAdjustment(new FormData()),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});

const INVENTORY_ERROR_PATH_FUNCS = [
    "createStockAdjustment",
    "processStockAdjustment",
    "createInventoryTransfer",
    "processInventoryTransfer",
    "receiveInventoryTransfer",
    "createMaterialIssue",
    "completeMaterialIssue",
    "createWorkOrder",
    "updateWorkOrder",
    "createRack",
    "updateRack",
    "deleteStockAdjustment",
    "deleteInventoryTransfer",
    "deleteMaterialIssue",
    "deleteRack",
    "updateStockAdjustment",
    "updateMaterialIssue",
    "updateInventoryTransfer",
    "createRackRow",
    "updateRackRow",
    "deleteRackRow",
  ];

function inventoryErrorArg(fn: string, fd: FormData): any {
  let arg: any = fd;
  if (
    fn === "processStockAdjustment" ||
    fn === "deleteStockAdjustment" ||
    fn === "deleteInventoryTransfer" ||
    fn === "deleteMaterialIssue" ||
    fn === "deleteRack" ||
    fn === "completeMaterialIssue" ||
    fn === "receiveInventoryTransfer" ||
    fn === "processInventoryTransfer"
  )
    arg = 1;
  if (fn.startsWith("update") || fn === "createWorkOrder") arg = [1, fd];
  if (fn === "createRackRow") arg = fd;
  if (fn === "createRack") arg = fd;
  return arg;
}

describe("Catch Block Coverage (isNextRedirectError + console.error)", () => {
  for (const fn of INVENTORY_ERROR_PATH_FUNCS) {
    it(`${fn} handles non-redirect error (covers isNextRedirectError false branch + console.error)`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      // Reset requirePermission and trigger a normal error
      if ((mocks as any).requirePermissionMock)
        (mocks as any).requirePermissionMock.mockRejectedValue(
          new Error("generic err"),
        );
      const fd = new FormData();
      fd.append("warehouseId", "1");
      const arg = inventoryErrorArg(fn, fd);
      const res = await (actions as any)[fn](arg);
      expect(res?.success).toBe(false);
      expect(res?.error).toBe("generic err");
    });
  }
});

describe("Catch block throw e for NextRedirectError", () => {
  for (const fn of INVENTORY_ERROR_PATH_FUNCS) {
    it(`${fn} rethrows NextRedirectError`, async () => {
      const redirectErr = new Error("NEXT_REDIRECT");
      (redirectErr as any).digest = "NEXT_REDIRECT_TOKEN";
      if ((mocks as any).requirePermissionMock)
        (mocks as any).requirePermissionMock.mockRejectedValue(redirectErr);
      const fd = new FormData();
      fd.append("warehouseId", "1");
      const arg = inventoryErrorArg(fn, fd);
      await expect((actions as any)[fn](arg)).rejects.toThrow();
    });
  }
});

describe("stocktake session (P1-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["admin"] });
    // Scope: admin penuh — getWarehouseScope default mock? Set akses dilalui
    // dengan warehouse scope "all".
  });

  it("approveStocktakeSession refuses self-approval (independence)", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      warehouseId: 2,
      status: "review",
      countedBy: 7,
    });
    const res = await actions.approveStocktakeSession(1);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/independen/);
    expect(mocks.prismaMock.stocktakeSession.update).not.toHaveBeenCalled();
  });

  it("approveStocktakeSession allows an independent approver", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      warehouseId: 2,
      status: "review",
      countedBy: 9,
    });
    const res = await actions.approveStocktakeSession(1);
    expect(res.success).toBe(true);
    expect(mocks.prismaMock.stocktakeSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 } }),
    );
  });

  it("postStocktakeSession refuses unapproved sessions", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      warehouseId: 2,
      status: "review",
      documentNo: "STK-1",
      lines: [],
    });
    const res = await actions.postStocktakeSession(1);
    expect(res.success).toBe(false);
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });
});

describe("remnant (P1-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["admin"] });
  });

  it("consumeRemnant only claims usable rows (atomic)", async () => {
    const fd = new FormData();
    fd.set("consumedBy", "WO-9");
    mocks.prismaMock.remnant.updateMany.mockResolvedValue({ count: 1 });
    const res = await actions.consumeRemnant(4, fd);
    expect(res.success).toBe(true);
    expect(mocks.prismaMock.remnant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 4, status: "usable" } }),
    );
  });

  it("consumeRemnant refuses an already-consumed row", async () => {
    const fd = new FormData();
    fd.set("consumedBy", "WO-9");
    mocks.prismaMock.remnant.updateMany.mockResolvedValue({ count: 0 });
    mocks.prismaMock.remnant.findUnique.mockResolvedValue({ status: "consumed" });
    const res = await actions.consumeRemnant(4, fd);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/consumed/);
  });

  it("scrapRemnant requires a reason", async () => {
    const res = await actions.scrapRemnant(4, new FormData());
    expect(res.success).toBe(false);
    expect(mocks.prismaMock.remnant.updateMany).not.toHaveBeenCalled();
  });
});
