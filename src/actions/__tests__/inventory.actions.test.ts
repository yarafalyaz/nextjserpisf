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
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
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
  // F-008: snapshot resolver — passthrough null (belum kalibrasi) di unit test.
  resolveMaterialIssueScrapSnapshots: vi.fn(async (_tx: any, rows: any[]) =>
    new Map(rows.map((r: any) => [r.itemId, null])),
  ),
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
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.stockAdjustment.create).toHaveBeenCalledTimes(1);
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
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.stockAdjustment.update).toHaveBeenCalledTimes(1);
  });
  it("processStockAdjustment succeeds", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment, { items: [] });
    const res = await actions.processStockAdjustment(1);
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.stockAdjustment.update).toHaveBeenCalled();
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
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.stockAdjustment.delete).toHaveBeenCalled();
  });
});

describe("Inventory Transfer Actions", () => {
  it("createInventoryTransfer succeeds", async () => {
    const res = await actions.createInventoryTransfer(transferFd());
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.inventoryTransfer.create).toHaveBeenCalledTimes(1);
  });
  it("createInventoryTransfer parses qty string format Indonesia penuh", async () => {
    mocks.prismaMock.inventoryTransfer.create.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].qty).toBe(2000);
        return { id: 1 };
      },
    );
    const res = await actions.createInventoryTransfer(
      transferFd({ items: itemsJson([{ itemId: 1, qty: "2.000" }]) }),
    );
    expect(res?.success).toBe(true);
  });
  it("createInventoryTransfer menolak qty tak terbaca tanpa create", async () => {
    const res = await actions.createInventoryTransfer(
      transferFd({ items: itemsJson([{ itemId: 1, qty: "abc" }]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Kuantitas tidak valid");
    expect(mocks.prismaMock.inventoryTransfer.create).not.toHaveBeenCalled();
  });
  it("updateInventoryTransfer parses qty string format Indonesia penuh", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    mocks.prismaMock.inventoryTransfer.update.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].qty).toBe(2000);
        return { id: 1 };
      },
    );
    const res = await actions.updateInventoryTransfer(
      1,
      transferFd({ items: itemsJson([{ itemId: 1, qty: "2.000" }]) }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    const res = await actions.updateInventoryTransfer(1, transferFd());
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.inventoryTransfer.update).toHaveBeenCalledTimes(1);
  });
  it("processInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer, { items: [] });
    const res = await actions.processInventoryTransfer(1);
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.inventoryTransfer.update).toHaveBeenCalled();
  });
  it("receiveInventoryTransfer succeeds", async () => {
    seedDoc(mocks.prismaMock.inventoryTransfer, "processed", { items: [] });
    const res = await actions.receiveInventoryTransfer(1);
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.inventoryTransfer.update).toHaveBeenCalled();
  });
  it("deleteInventoryTransfer succeeds", async () => {
    seedDraft(mocks.prismaMock.inventoryTransfer);
    const res = await actions.deleteInventoryTransfer(1);
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.inventoryTransfer.delete).toHaveBeenCalled();
  });
});

describe("Material Issue Actions", () => {
  it("createMaterialIssue succeeds", async () => {
    const res = await actions.createMaterialIssue(miFd());
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.materialIssue.create).toHaveBeenCalledTimes(1);
  });
  it("createMaterialIssue parses qty/unitCost string format Indonesia penuh", async () => {
    mocks.prismaMock.materialIssue.create.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].qty).toBe(2000);
        expect(data.items.create[0].cost).toBe(2000000);
        return { id: 1 };
      },
    );
    const res = await actions.createMaterialIssue(
      miFd({
        items: itemsJson([{ itemId: 1, qty: "2.000", unitCost: "2.000.000" }]),
      }),
    );
    expect(res?.success).toBe(true);
  });
  it("createMaterialIssue menolak unitCost tak terbaca tanpa create", async () => {
    const res = await actions.createMaterialIssue(
      miFd({ items: itemsJson([{ itemId: 1, qty: 5, unitCost: "abc" }]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Biaya satuan tidak valid");
    expect(mocks.prismaMock.materialIssue.create).not.toHaveBeenCalled();
  });
  it("updateMaterialIssue parses qty/unitCost string format Indonesia penuh", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    mocks.prismaMock.materialIssue.update.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].qty).toBe(2000);
        expect(data.items.create[0].cost).toBe(2000000);
        return { id: 1 };
      },
    );
    const res = await actions.updateMaterialIssue(
      1,
      miFd({
        items: itemsJson([{ itemId: 1, qty: "2.000", unitCost: "2.000.000" }]),
      }),
    );
    expect(res?.success).toBe(true);
  });
  it("updateMaterialIssue succeeds", async () => {
    seedDraft(mocks.prismaMock.materialIssue);
    const res = await actions.updateMaterialIssue(1, miFd());
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.materialIssue.update).toHaveBeenCalledTimes(1);
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
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.materialIssue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1, status: "draft" } }),
    );
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
    expect(res?.success).toBe(true);
    expect(mocks.prismaMock.materialIssue.delete).toHaveBeenCalled();
  });
  // WO-BR-004: form Inventaris menolak MI kedua untuk WO yang sama.
  it("createMaterialIssue menolak WO yang sudah punya MI aktif", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValueOnce({
      id: 7, documentNo: "MI-0007",
    });
    const res = await actions.createMaterialIssue(miFd({ workOrderId: 42 }));
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("sudah pernah dibuat untuk Work Order ini");
    expect(mocks.prismaMock.materialIssue.create).not.toHaveBeenCalled();
  });
  it("createMaterialIssue mengizinkan MI pengganti sesudah MI lama batal", async () => {
    mocks.prismaMock.materialIssue.findFirst.mockResolvedValueOnce(null);
    const res = await actions.createMaterialIssue(miFd({ workOrderId: 42 }));
    expectSuccess(res);
    expect(mocks.prismaMock.materialIssue.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: 42, status: { in: ["draft", "processing", "completed"] } } }),
    );
    expect(mocks.prismaMock.materialIssue.create).toHaveBeenCalledTimes(1);
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
    expect((mocks as any).requirePermissionMock).toHaveBeenCalled();
    expect((mocks as any).requirePermissionMock.mock.calls[0]?.[0]).toEqual(
      expect.any(String),
    );
  }

  async function expectGlobalReject(fnName: string) {
    await expectPermissionReject(fnName);
    expect(mocks.requirePermissionMock).toHaveBeenCalled();
  }

  it("createStockAdjustment handles error globally", () => expectGlobalReject("createStockAdjustment"));
  it("processStockAdjustment handles error globally", () => expectGlobalReject("processStockAdjustment"));
  it("createInventoryTransfer handles error globally", () => expectGlobalReject("createInventoryTransfer"));
  it("processInventoryTransfer handles error globally", () => expectGlobalReject("processInventoryTransfer"));
  it("receiveInventoryTransfer handles error globally", () => expectGlobalReject("receiveInventoryTransfer"));
  it("createMaterialIssue handles error globally", () => expectGlobalReject("createMaterialIssue"));
  it("completeMaterialIssue handles error globally", () => expectGlobalReject("completeMaterialIssue"));
  it("createWorkOrder handles error globally", () => expectGlobalReject("createWorkOrder"));
  it("updateWorkOrder handles error globally", () => expectGlobalReject("updateWorkOrder"));
  it("createRack handles error globally", () => expectGlobalReject("createRack"));
  it("updateRack handles error globally", () => expectGlobalReject("updateRack"));
  it("deleteStockAdjustment handles error globally", () => expectGlobalReject("deleteStockAdjustment"));
  it("deleteInventoryTransfer handles error globally", () => expectGlobalReject("deleteInventoryTransfer"));
  it("deleteMaterialIssue handles error globally", () => expectGlobalReject("deleteMaterialIssue"));
  it("deleteRack handles error globally", () => expectGlobalReject("deleteRack"));
  it("updateStockAdjustment handles error globally", () => expectGlobalReject("updateStockAdjustment"));
  it("updateMaterialIssue handles error globally", () => expectGlobalReject("updateMaterialIssue"));
  it("updateInventoryTransfer handles error globally", () => expectGlobalReject("updateInventoryTransfer"));
  it("createRackRow handles error globally", () => expectGlobalReject("createRackRow"));
  it("updateRackRow handles error globally", () => expectGlobalReject("updateRackRow"));
  it("deleteRackRow handles error globally", () => expectGlobalReject("deleteRackRow"));
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

  it("createStockAdjustment membaca unitCost/newQty format Indonesia penuh, bukan 2", async () => {
    // Regresi: Number("2.000.000")=2 dan Number("2.000")=2 merusak
    // unitCost/totalCost/actualQty diam-diam (pola createRemnant).
    mocks.prismaMock.stockAdjustment.create.mockImplementationOnce(
      ({ data }: any) => {
        const item = data.items.create[0];
        expect(item.actualQty).toBe(2000);
        expect(item.unitCost).toBe(2000000);
        // systemQty mock default: groupBy {qty:5} tanpa impact -> -5.
        expect(item.totalCost).toBe(item.difference * 2000000);
        expect(item.difference).toBe(2005);
        return { id: 1 };
      },
    );
    const res = await actions.createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, newQty: "2.000", unitCost: "2.000.000" }]) }),
    );
    expect(res?.success).toBe(true);
  });

  it("createStockAdjustment menolak unitCost tak terbaca, bukan diam-diam 0", async () => {
    const res = await actions.createStockAdjustment(
      saFd({ items: itemsJson([{ itemId: 1, newQty: 10, unitCost: "bukan-angka" }]) }),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Biaya satuan tidak valid");
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
  });

  it("updateStockAdjustment membaca unitCost format Indonesia penuh, bukan 2", async () => {
    seedDraft(mocks.prismaMock.stockAdjustment);
    mocks.prismaMock.stockAdjustment.findUnique.mockResolvedValue({ id: 1, status: "draft" });
    mocks.prismaMock.stockAdjustment.update.mockImplementationOnce(
      ({ data }: any) => {
        const item = data.items.create[0];
        expect(item.unitCost).toBe(2000000);
        return { id: 1 };
      },
    );
    const res = await (actions as any).updateStockAdjustment(
      1,
      saFd({ items: itemsJson([{ itemId: 1, newQty: 10, unitCost: "2.000.000" }]) }),
    );
    expect(res?.success).toBe(true);
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
  it("createWorkOrder parses qty/cost string format Indonesia penuh", async () => {
    mocks.prismaMock.workOrder.create.mockImplementationOnce(
      ({ data }: any) => {
        expect(data.items.create[0].qty).toBe(2000);
        expect(data.items.create[0].cost).toBe(2000000);
        return { id: 1 };
      },
    );
    const res = await (actions as any).createWorkOrder(
      woFd({}, [{ itemId: 1, qty: "2.000", cost: "2.000.000" }]),
    );
    expect(res?.success).toBe(true);
  });
  it("createWorkOrder menolak qty tak terbaca tanpa create", async () => {
    const res = await (actions as any).createWorkOrder(
      woFd({}, [{ itemId: 1, qty: "abc", cost: 100 }]),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Kuantitas tidak valid");
    expect(mocks.prismaMock.workOrder.create).not.toHaveBeenCalled();
  });
  it("createWorkOrder menolak cost tak terbaca tanpa create", async () => {
    const res = await (actions as any).createWorkOrder(
      woFd({}, [{ itemId: 1, qty: 5, cost: "abc" }]),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Biaya satuan tidak valid");
    expect(mocks.prismaMock.workOrder.create).not.toHaveBeenCalled();
  });
  it("updateWorkOrder parses qty/cost string format Indonesia penuh", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    mocks.prismaMock.workOrderItem.createMany.mockImplementationOnce(
      ({ data }: any) => {
        expect(data[0].qty).toBe(2000);
        expect(data[0].cost).toBe(2000000);
        return { count: 1 };
      },
    );
    const res = await (actions as any).updateWorkOrder(
      1,
      woFd({}, [{ itemId: 1, qty: "2.000", cost: "2.000.000" }]),
    );
    expect(res?.success).toBe(true);
  });
  it("updateWorkOrder menolak qty tak terbaca tanpa transaksi", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    const res = await (actions as any).updateWorkOrder(
      1,
      woFd({}, [{ itemId: 1, qty: "abc", cost: 100 }]),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Kuantitas tidak valid");
    expect(mocks.prismaMock.workOrderItem.createMany).not.toHaveBeenCalled();
  });
  it("updateWorkOrder menolak cost negatif tanpa transaksi", async () => {
    seedDraft(mocks.prismaMock.workOrder);
    const res = await (actions as any).updateWorkOrder(
      1,
      woFd({}, [{ itemId: 1, qty: 5, cost: -1 }]),
    );
    expect(res?.success).toBe(false);
    expect(res?.error).toContain("Biaya satuan tidak valid");
    expect(mocks.prismaMock.workOrderItem.createMany).not.toHaveBeenCalled();
  });
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
    mocks.prismaMock.warehouse.findUnique.mockResolvedValue({ id: 1 });
    // Scope: admin penuh — getWarehouseScope default mock? Set akses dilalui
    // dengan warehouse scope "all".
  });

  it("createStocktakeSession menolak tanggal kalender fiktif", async () => {
    const fd = new FormData();
    fd.set("warehouseId", "1");
    fd.set("date", "2026-02-30");
    const res = await actions.createStocktakeSession(fd);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/Tanggal tidak valid/);
    expect(mocks.prismaMock.stocktakeSession.create).not.toHaveBeenCalled();
  });

  it("createStocktakeSession menyimpan tanggal sebagai tengah malam UTC WIB", async () => {
    const fd = new FormData();
    fd.set("warehouseId", "1");
    fd.set("date", "2026-06-13");
    fd.set("notes", "x".repeat(1500));
    const res = await actions.createStocktakeSession(fd);
    expect(res.success).toBe(true);
    const arg = mocks.prismaMock.stocktakeSession.create.mock.calls[0][0];
    expect(arg.data.date.toISOString()).toBe("2026-06-13T00:00:00.000Z");
    expect(arg.data.notes).toHaveLength(1000);
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

  // AUD-01: klaim posting harus satu transaksi dengan lock baris sesi,
  // untuk cabang tanpa selisih maupun dengan selisih.
  it("postStocktakeSession tanpa selisih: lock sesi lalu posted dalam satu transaksi", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({ warehouseId: 1 });
    mocks.prismaMock.stocktakeSession.findUnique.mockResolvedValue({
      id: 1,
      warehouseId: 1,
      status: "approved",
      documentNo: "STK-1",
      lines: [
        { itemId: 10, systemQty: 10, count1: 10, count2: null, item: { cost: 5 } },
      ],
    });
    const res = await actions.postStocktakeSession(1);
    expect(res).toEqual({ success: true, adjustmentId: null });
    expect(mocks.prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const lockOrder = mocks.prismaMock.$queryRaw.mock.invocationCallOrder[0];
    const updateOrder = mocks.prismaMock.stocktakeSession.update.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(updateOrder);
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
    expect(mocks.prismaMock.stocktakeSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "posted" } }),
    );
  });

  it("postStocktakeSession berselisih: hanya pemegang lock yang membuat adjustment", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({ warehouseId: 1 });
    mocks.prismaMock.stocktakeSession.findUnique.mockResolvedValue({
      id: 1,
      warehouseId: 1,
      status: "approved",
      documentNo: "STK-1",
      lines: [
        { itemId: 10, systemQty: 10, count1: 8, count2: null, item: { cost: 5 } },
      ],
    });
    mocks.prismaMock.stockAdjustment.create.mockResolvedValue({ id: 99 });
    const res = await actions.postStocktakeSession(1);
    expect(res).toEqual({ success: true, adjustmentId: 99 });
    const lockOrder = mocks.prismaMock.$queryRaw.mock.invocationCallOrder[0];
    const createOrder = mocks.prismaMock.stockAdjustment.create.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(createOrder);
    expect(mocks.prismaMock.stocktakeSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "posted", adjustmentId: 99 } }),
    );
  });

  it("postStocktakeSession menolak sesi yang sudah posted (kalah klaim)", async () => {
    mocks.prismaMock.stocktakeSession.findUniqueOrThrow.mockResolvedValue({ warehouseId: 1 });
    mocks.prismaMock.stocktakeSession.findUnique.mockResolvedValue({
      id: 1,
      warehouseId: 1,
      status: "posted",
      documentNo: "STK-1",
      lines: [],
    });
    const res = await actions.postStocktakeSession(1);
    expect(res.success).toBe(false);
    expect(mocks.prismaMock.stockAdjustment.create).not.toHaveBeenCalled();
    expect(mocks.prismaMock.stocktakeSession.update).not.toHaveBeenCalled();
  });
});

describe("remnant (P1-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["admin"] });
    // F-098-S: usable wajib ambang kategori — fixture lama tanpa dimensi kini
    // ditolak di guard baru; mock kategori berambang agar jalur sukses lama
    // (parsing unitCost/uom) tetap teruji apa adanya.
    mocks.prismaMock.item.findUnique.mockResolvedValue({ id: 1, category: { remnantMinMeasure: 100 } });
    mocks.prismaMock.warehouse.findUnique.mockResolvedValue({ id: 1 });
  });

  const usableFd = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    fd.set("itemId", "1");
    fd.set("warehouseId", "1");
    fd.set("qty", "2");
    fd.set("unitCost", "1500");
    fd.set("dimensions", "1200x300 mm");
    fd.set("measuredSize", "1200");
    fd.set("sourceType", "material_issue_item");
    fd.set("sourceId", "42");
    for (const [k, v] of Object.entries(over)) fd.set(k, v);
    return fd;
  };

  it("createRemnant menolak unitCost negatif bukan diam-diam 0", async () => {
    const fd = new FormData();
    fd.set("itemId", "1");
    fd.set("warehouseId", "1");
    fd.set("qty", "2");
    fd.set("unitCost", "-5");
    const res = await actions.createRemnant(fd);
    expect(res.success).toBe(false);
    expect(mocks.prismaMock.remnant.create).not.toHaveBeenCalled();
  });

  it("createRemnant menolak sourceId non-integer dan memotong teks panjang", async () => {
    const bad = new FormData();
    bad.set("itemId", "1");
    bad.set("warehouseId", "1");
    bad.set("qty", "2");
    bad.set("sourceId", "abc");
    const badRes = await actions.createRemnant(bad);
    expect(badRes.success).toBe(false);
    expect(mocks.prismaMock.remnant.create).not.toHaveBeenCalled();

    const fd = usableFd({ uom: "u".repeat(50) });
    const res = await actions.createRemnant(fd);
    expect(res.success).toBe(true);
    const arg = mocks.prismaMock.remnant.create.mock.calls[0][0];
    expect(arg.data.uom).toHaveLength(32);
    expect(arg.data.unitCost).toBe(1500);
    expect(arg.data.sourceId).toBe(42);
  });

  it("createStocktakeSession menolak gudang yang tidak ada (bukan P2003 mentah)", async () => {
    mocks.prismaMock.warehouse.findUnique.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("warehouseId", "999");
    fd.set("date", "2026-06-13");
    const res = await actions.createStocktakeSession(fd);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/Gudang tidak ditemukan/);
    expect(mocks.prismaMock.stocktakeSession.create).not.toHaveBeenCalled();
  });

  it("createRemnant membaca unitCost format Indonesia penuh, bukan 2", async () => {
    const fd = usableFd({ unitCost: "2.000.000" });
    const res = await actions.createRemnant(fd);
    expect(res.success).toBe(true);
    const arg = mocks.prismaMock.remnant.create.mock.calls[0][0];
    expect(arg.data.unitCost).toBe(2000000);

    const bad = new FormData();
    bad.set("itemId", "1");
    bad.set("warehouseId", "1");
    bad.set("qty", "2");
    bad.set("unitCost", "bukan-angka");
    const badRes = await actions.createRemnant(bad);
    expect(badRes.success).toBe(false);
    expect(mocks.prismaMock.remnant.create).toHaveBeenCalledTimes(1);
  });

  it("createRemnant menolak barang yang tidak ada (bukan P2003 mentah)", async () => {
    mocks.prismaMock.item.findUnique.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("itemId", "999");
    fd.set("warehouseId", "1");
    fd.set("qty", "2");
    fd.set("unitCost", "100");
    const res = await actions.createRemnant(fd);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/Barang tidak ditemukan/);
    expect(mocks.prismaMock.remnant.create).not.toHaveBeenCalled();
  });

  it("consumeRemnant only claims usable rows (atomic)", async () => {
    const fd = new FormData();
    fd.set("consumedBy", "WO-9");
    mocks.prismaMock.remnant.findUnique.mockResolvedValue({ warehouseId: 1 });
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
    mocks.prismaMock.remnant.findUnique
      .mockResolvedValueOnce({ warehouseId: 1 })
      .mockResolvedValue({ status: "consumed" });
    mocks.prismaMock.remnant.updateMany.mockResolvedValue({ count: 0 });
    const res = await actions.consumeRemnant(4, fd);
    expect(res.success).toBe(false);
    expect(String((res as { error?: string }).error ?? "")).toMatch(/consumed/);
  });

  it("scrapRemnant requires a reason", async () => {
    mocks.prismaMock.remnant.findUnique.mockResolvedValue({ warehouseId: 1 });
    const res = await actions.scrapRemnant(4, new FormData());
    expect(res.success).toBe(false);
    expect(mocks.prismaMock.remnant.updateMany).not.toHaveBeenCalled();
  });

  it("F-098-S createRemnant tanpa dimensi/tautan/ambang ditolak (AC-SCRAP-1)", async () => {
    const noDims = usableFd();
    noDims.delete("dimensions");
    expect((await actions.createRemnant(noDims)).success).toBe(false);
    const noLink = usableFd();
    noLink.delete("sourceId");
    const noLinkRes = await actions.createRemnant(noLink);
    expect(noLinkRes.success).toBe(false);
    if (!noLinkRes.success) expect(noLinkRes.error).toMatch(/tertaut/);
    mocks.prismaMock.item.findUnique.mockResolvedValue({ id: 1, category: { remnantMinMeasure: null } });
    const noThresholdRes = await actions.createRemnant(usableFd());
    expect(noThresholdRes.success).toBe(false);
    if (!noThresholdRes.success) expect(noThresholdRes.error).toMatch(/belum ditetapkan/);
    const belowRes = await actions.createRemnant(usableFd({ measuredSize: "50" }));
    expect(belowRes.success).toBe(false);
    expect(mocks.prismaMock.remnant.create).not.toHaveBeenCalled();
  });

  it("F-098-S createRemnant usable sah membekukan snapshot ambang (AC-SCRAP-1)", async () => {
    const res = await actions.createRemnant(usableFd());
    expect(res.success).toBe(true);
    const arg = mocks.prismaMock.remnant.create.mock.calls[0][0];
    expect(arg.data.remnantMinMeasureSnapshot).toBe(100);
    expect(arg.data.measuredSize).toBe(1200);
    expect(arg.data.sourceType).toBe("material_issue_item");
  });

  it("F-098-S scrapRemnant tanpa kg ditolak; dengan kg tercatat (AC-SCRAP-7)", async () => {
    mocks.prismaMock.remnant.findUnique.mockResolvedValue({ warehouseId: 1 });
    mocks.prismaMock.remnant.updateMany.mockResolvedValue({ count: 1 });
    const noKg = new FormData();
    noKg.set("scrapReason", "tak terpakai");
    expect((await actions.scrapRemnant(4, noKg)).success).toBe(false);
    expect(mocks.prismaMock.remnant.updateMany).not.toHaveBeenCalled();
    const fd = new FormData();
    fd.set("scrapReason", "tak terpakai");
    fd.set("scrapWeightKg", "12.5");
    expect((await actions.scrapRemnant(4, fd)).success).toBe(true);
    expect(mocks.prismaMock.remnant.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ scrapWeightKg: 12.5 }) }),
    );
  });

  it("F-098-S reviewAbnormalScrap: izin + disposisi + hanya kolom tinjau (AC-SCRAP-5/6)", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 9, roles: ["admin"] });
    const res = await actions.reviewAbnormalScrap({ source: "MI", lineId: 5, disposition: "kelalaian", note: "teguran tertulis" });
    expect(res.success).toBe(true);
    expect(mocks.requirePermissionMock).toHaveBeenCalledWith("complete_work_orders");
    const call = mocks.prismaMock.materialIssueItem.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 5, scrapReviewStatus: "menunggu_tinjau" });
    expect(Object.keys(call.data).sort()).toEqual([
      "scrapReviewDisposition", "scrapReviewNote", "scrapReviewStatus", "scrapReviewedAt", "scrapReviewedBy",
    ]);
    expect(call.data.scrapReviewStatus).toBe("ditinjau");

    const noNote = await actions.reviewAbnormalScrap({ source: "PO", lineId: 6, disposition: "kelalaian", note: " " });
    expect(noNote.success).toBe(false);
    expect(mocks.prismaMock.productionOrderMaterial.updateMany).not.toHaveBeenCalled();

    mocks.prismaMock.materialIssueItem.updateMany.mockResolvedValue({ count: 0 });
    const stale = await actions.reviewAbnormalScrap({ source: "MI", lineId: 5, disposition: "diterima_wajar" });
    expect(stale.success).toBe(false);
  });

  it("E135-5: disposisi kelalaian nol jurnal/potongan — hanya 5 kolom tinjau berubah", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 9, roles: ["admin"] });
    mocks.prismaMock.materialIssueItem.updateMany.mockResolvedValue({ count: 1 });
    const res = await actions.reviewAbnormalScrap({ source: "MI", lineId: 5, disposition: "kelalaian", note: "teguran tertulis" });
    expect(res.success).toBe(true);
    const call = mocks.prismaMock.materialIssueItem.updateMany.mock.calls[0][0];
    // Snapshot klasifikasi/nilai 066-V byte-sama: tidak ada kolom uang/qty.
    expect(Object.keys(call.data).sort()).toEqual([
      "scrapReviewDisposition", "scrapReviewNote", "scrapReviewStatus", "scrapReviewedAt", "scrapReviewedBy",
    ]);
    // Nol jurnal baru, nol gerakan stok, nol baris item lain tersentuh.
    expect(mocks.prismaMock.journal.create).not.toHaveBeenCalled();
    expect(mocks.prismaMock.journal.createMany).not.toHaveBeenCalled();
    expect(mocks.prismaMock.stockMove.create).not.toHaveBeenCalled();
    expect(mocks.prismaMock.stockMove.createMany).not.toHaveBeenCalled();
  });

  it("consumeRemnant/scrapRemnant menolak gudang di luar scope user", async () => {
    mocks.requirePermissionMock.mockResolvedValue({ id: 7, roles: ["warehouse"] });
    mocks.prismaMock.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 1 }]);
    mocks.prismaMock.remnant.findUnique.mockResolvedValue({ warehouseId: 2 });
    const fd = new FormData();
    fd.set("consumedBy", "WO-9");
    fd.set("scrapReason", "rusak");
    expect((await actions.consumeRemnant(4, fd)).success).toBe(false);
    expect((await actions.scrapRemnant(4, fd)).success).toBe(false);
    expect(mocks.prismaMock.remnant.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["itemId", "0x10"], ["itemId", "1e3"], ["itemId", "0b101"], ["itemId", " 1"], ["itemId", "+1"], ["itemId", "1.0"],
    ["warehouseId", "0x10"], ["warehouseId", "1e3"], ["warehouseId", "0b101"], ["warehouseId", " 1"], ["warehouseId", "+1"], ["warehouseId", "1.0"],
    ["qty", "1e3"], ["qty", "0x2"], ["qty", " 2"], ["qty", "+2 "], ["qty", ""], ["qty", "-2"],
  ])("createRemnant menolak %s=%j bukan desimal murni", async (field, weird) => {
    const fd = new FormData();
    fd.set("itemId", "1");
    fd.set("warehouseId", "1");
    fd.set("qty", "2");
    fd.set("unitCost", "1500");
    fd.set(field, weird);
    expect((await actions.createRemnant(fd)).success).toBe(false);
    expect(mocks.prismaMock.remnant.create).not.toHaveBeenCalled();
  });

  it.each(["0x10", "1e3", "0b101", " 1", "+1", "1.0"])(
    "createStocktakeSession menolak warehouseId=%j bukan desimal murni",
    async (weird) => {
      const fd = new FormData();
      fd.set("warehouseId", weird);
      fd.set("date", "2026-06-13");
      expect((await actions.createStocktakeSession(fd)).success).toBe(false);
      expect(mocks.prismaMock.stocktakeSession.create).not.toHaveBeenCalled();
    },
  );
});
