import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  generateDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/services/notification.service", () => ({
  notificationService: { checkAndNotifyLowStock: mocks.notify },
}));

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}));

// prisma singleton is imported by the module; expose a controllable $transaction
// so issueProjectMaterials (which uses the singleton) can be exercised.
const singletonMocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => singletonMocks.transaction(fn),
  },
}));

import { InventoryService, issueProjectMaterials } from "@/lib/services/inventory.service";

function buildService(txSpies: Record<string, unknown> = {}) {
  const spies = {
    moveFindUniqueOrThrow: vi.fn(),
    moveUpdate: vi.fn().mockResolvedValue({}),
    moveCreate: vi.fn(),
    layerCreate: vi.fn().mockResolvedValue({}),
    layerUpdate: vi.fn().mockResolvedValue({}),
    itemFindUnique: vi.fn().mockResolvedValue(null),
    queryRaw: vi.fn(),
    executeRaw: vi.fn().mockResolvedValue(1),
    ...txSpies,
  };

  const tx = {
    stockMove: {
      findUniqueOrThrow: spies.moveFindUniqueOrThrow,
      update: spies.moveUpdate,
      create: spies.moveCreate,
    },
    inventoryLayer: { create: spies.layerCreate, update: spies.layerUpdate },
    item: { findUnique: spies.itemFindUnique },
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
  };

  const prismaLike = {
    $transaction: (fn: (t: Prisma.TransactionClient) => Promise<unknown>) => fn(tx as unknown as Prisma.TransactionClient),
  } as unknown as PrismaClient;

  return { service: new InventoryService(prismaLike), spies };
}

describe("InventoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("postMove", () => {
    it("throws when move already posted", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-1", status: "posted", impact: "IN",
      });

      await expect(service.postMove(1)).rejects.toThrow("already posted");
    });

    it("handles IN move: creates layer, increments qty, marks posted", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-1", status: "draft", impact: "IN",
        itemId: 5, warehouseId: 2, qty: 100, cost: 10,
      });

      await service.postMove(1);

      expect(spies.layerCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ itemId: 5, warehouseId: 2, qtyIn: 100, remaining: 100, unitCost: 10 }),
      });
      expect(spies.executeRaw).toHaveBeenCalled();
      expect(spies.moveUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "posted" },
      });
    });

    it("handles OUT move: consumes FIFO, updates cost, decrements qty", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: 2, qty: 30, cost: 0,
      });
      // first $queryRaw call → item lock; second → layers
      spies.queryRaw
        .mockResolvedValueOnce([{ id: 5, sku: "ITM-5", qty_on_hand: 100 }])
        .mockResolvedValueOnce([
          { id: 1, remaining: 20, unit_cost: 5 },
          { id: 2, remaining: 50, unit_cost: 8 },
        ]);
      spies.executeRaw.mockResolvedValue(1);

      await service.postMove(1);

      // consumed 20@5=100 + 10@8=80 = 180, unitCost = 180/30 = 6
      expect(spies.moveUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { cost: 6 },
      });
      expect(spies.layerUpdate).toHaveBeenCalledTimes(2);
    });

    it("throws on OUT when item not found", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: 2, qty: 30,
      });
      spies.queryRaw.mockResolvedValueOnce([]); // item lock returns nothing

      await expect(service.postMove(1)).rejects.toThrow("Item not found");
    });

    it("throws on OUT when stock insufficient (item-level guard)", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: 2, qty: 200,
      });
      spies.queryRaw.mockResolvedValueOnce([{ id: 5, sku: "ITM-5", qty_on_hand: 100 }]);

      await expect(service.postMove(1)).rejects.toThrow("Stok tidak mencukupi untuk item ITM-5. Tersedia: 100, Dibutuhkan: 200");
    });

    it("throws on OUT when stock insufficient (layer-level guard, warehouseId null)", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: null, qty: 30,
      });
      // item has enough globally (or lock succeeds), but layers fall short
      spies.queryRaw
        .mockResolvedValueOnce([{ id: 5, sku: "ITM-5", qty_on_hand: 100 }])
        .mockResolvedValueOnce([
          { id: 1, remaining: 10, unit_cost: 5 }, // Only 10 available across layers
        ]);

      await expect(service.postMove(1)).rejects.toThrow("Stok tidak mencukupi untuk item ITM-5. Kurang 20.");
    });

    it("notifies asynchronously if item qtyOnHand falls to or below minStock", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-3", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: 2, qty: 10, cost: 0,
      });
      spies.queryRaw
        .mockResolvedValueOnce([{ id: 5, sku: "ITM-5", qty_on_hand: 100 }])
        .mockResolvedValueOnce([{ id: 1, remaining: 100, unit_cost: 5 }]);
      
      // Simulate that after decrement, qtyOnHand = 4, minStock = 5
      spies.itemFindUnique.mockResolvedValue({
        id: 5, sku: "ITM-5", qtyOnHand: 4, minStock: 5,
      });

      await service.postMove(1);

      // We must wait for the setTimeout(..., 0) inside postMove to execute
      await new Promise((r) => setTimeout(r, 10));

      expect(mocks.notify).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, qtyOnHand: 4, minStock: 5 })
      );
    });

    it("throws on any impact type", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-3", status: "draft", impact: "SIDEWAYS",
      });

      await expect(service.postMove(1)).rejects.toThrow("Unknown impact type");
    });

    it("throws on concurrent modification when decrement affects 0 rows", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "draft", impact: "OUT",
        itemId: 5, warehouseId: 2, qty: 30,
      });
      spies.queryRaw
        .mockResolvedValueOnce([{ id: 5, sku: "ITM-5", qty_on_hand: 100 }])
        .mockResolvedValueOnce([{ id: 1, remaining: 50, unit_cost: 5 }]);
      spies.executeRaw.mockResolvedValue(0); // 0 rows updated → concurrent change

      await expect(service.postMove(1)).rejects.toThrow("Concurrent stock modification");
    });
  });

  describe("reverseMove", () => {
    it("throws when original move is not posted", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-1", status: "draft", impact: "IN",
      });

      await expect(service.reverseMove(1)).rejects.toThrow("Cannot reverse move");
    });

    it("creates an opposite move and marks original reversed (IN→OUT)", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-1", status: "posted", impact: "IN",
        itemId: 5, qty: 100, cost: 10, referenceType: "GR", referenceId: 9, warehouseId: 2,
      });
      spies.moveCreate.mockResolvedValue({ id: 50 });

      const result = await service.reverseMove(1);

      expect(result).toBe(50);
      expect(spies.moveCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentNo: "REV-SM-1",
          impact: "OUT",
          status: "draft",
        }),
      });
      expect(spies.moveUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "reversed" },
      });
    });

    it("reverses OUT→IN", async () => {
      const { service, spies } = buildService();
      spies.moveFindUniqueOrThrow.mockResolvedValue({
        id: 1, documentNo: "SM-2", status: "posted", impact: "OUT",
        itemId: 5, qty: 30, cost: 6, referenceType: "WO", referenceId: 3, warehouseId: 2,
      });
      spies.moveCreate.mockResolvedValue({ id: 51 });

      const result = await service.reverseMove(1);

      expect(result).toBe(51);
      expect(spies.moveCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ impact: "IN" }),
      });
    });
  });

  describe("issueProjectMaterials", () => {
    function buildIssueTx(opts: {
      project: { items: { itemId: number | null; qty: number }[] } | null;
      existingMove?: { id: number } | null;
    }) {
      const spies = {
        executeRaw: vi.fn().mockResolvedValue(1),
        projectFindUnique: vi.fn().mockResolvedValue(opts.project),
        moveFindFirst: vi.fn().mockResolvedValue(opts.existingMove ?? null),
        moveCreate: vi.fn().mockResolvedValue({ id: 999 }),
      };
      const tx = {
        $executeRaw: spies.executeRaw,
        project: { findUnique: spies.projectFindUnique },
        stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
      };
      return { tx, spies };
    }

    it("throws when project not found", async () => {
      const { tx } = buildIssueTx({ project: null });
      singletonMocks.transaction.mockImplementation(async (fn) => fn(tx));

      await expect(issueProjectMaterials(1, 2)).rejects.toThrow("Project not found");
    });

    it("returns existing move ids when already issued (idempotent)", async () => {
      const { tx, spies } = buildIssueTx({
        project: { items: [{ itemId: 5, qty: 10 }] },
        existingMove: { id: 777 },
      });
      singletonMocks.transaction.mockImplementation(async (fn) => fn(tx));

      const result = await issueProjectMaterials(1, 2);

      expect(result).toEqual([777]);
      expect(spies.moveCreate).not.toHaveBeenCalled();
    });

    it("skips items without an itemId", async () => {
      const { tx, spies } = buildIssueTx({
        project: { items: [{ itemId: null, qty: 5 }] },
      });
      singletonMocks.transaction.mockImplementation(async (fn) => fn(tx));

      const result = await issueProjectMaterials(1, 2);

      expect(result).toEqual([]);
      expect(spies.moveCreate).not.toHaveBeenCalled();
    });

    it("returns empty array when project has no items", async () => {
      const { tx } = buildIssueTx({ project: { items: [] } });
      singletonMocks.transaction.mockImplementation(async (fn) => fn(tx));

      const result = await issueProjectMaterials(1, 2);

      expect(result).toEqual([]);
    });

    it("creates moves for new materials and returns their IDs along with existing ones", async () => {
      const customTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        project: {
          findUnique: vi.fn().mockResolvedValue({
            id: 99, items: [{ itemId: 1, qty: 5 }, { itemId: 2, qty: 10 }]
          })
        },
        stockMove: {
          findFirst: vi.fn()
            .mockResolvedValueOnce({ id: 100 }) // item 1 already exists
            .mockResolvedValueOnce(null),       // item 2 needs creation
          create: vi.fn().mockResolvedValue({ id: 101 }),
        }
      };

      singletonMocks.transaction.mockImplementationOnce(async (fn: any) => {
        const { inventoryService } = await import('@/lib/services/inventory.service');
        const postSpy = vi.spyOn(inventoryService, 'postMove').mockResolvedValue(undefined as any);
        const res = await fn(customTx);
        expect(postSpy).toHaveBeenCalledWith(101, customTx);
        postSpy.mockRestore();
        return res;
      });

      const res = await issueProjectMaterials(99, 1);
      expect(res).toEqual([100, 101]);
      expect(customTx.stockMove.create).toHaveBeenCalledOnce();
    });
  });
});

