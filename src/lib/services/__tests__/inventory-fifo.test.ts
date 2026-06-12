import { describe, it, expect, vi, beforeEach } from "vitest";
import { availableQty, consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";

// Build a mock transaction client. `$queryRaw` returns the locked layer rows.
function mockTx(opts: {
  aggregateRemaining?: number;
  layers?: { id: number; remaining: number; unitCost: number; batchNumber: string | null }[];
  trackSerial?: boolean;
  itemBatch?: { id: number; qty: number } | null;
  availableSerials?: { id: number }[];
}) {
  const layerUpdate = vi.fn().mockResolvedValue({});
  const batchUpdate = vi.fn().mockResolvedValue({});
  const serialUpdateMany = vi.fn().mockResolvedValue({});
  const layerCreate = vi.fn().mockResolvedValue({});

  const tx = {
    inventoryLayer: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { remaining: opts.aggregateRemaining ?? 0 } }),
      update: layerUpdate,
      create: layerCreate,
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.layers ?? []),
    itemBatch: {
      findMany: vi.fn().mockResolvedValue(
        opts.itemBatch ? [{ id: opts.itemBatch.id, batchNumber: "BATCH-A", qty: opts.itemBatch.qty }] : [],
      ),
      update: batchUpdate,
    },
    item: {
      findUnique: vi.fn().mockResolvedValue({ trackSerial: opts.trackSerial ?? false }),
    },
    itemSerial: {
      findMany: vi.fn().mockResolvedValue(opts.availableSerials ?? []),
      updateMany: serialUpdateMany,
    },
    _spies: { layerUpdate, batchUpdate, serialUpdateMany, layerCreate },
  } as any;
  return tx;
}

describe("inventory-fifo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("availableQty", () => {
    it("returns summed remaining for an item", async () => {
      const tx = mockTx({ aggregateRemaining: 25 });
      expect(await availableQty(tx, 1)).toBe(25);
    });

    it("returns 0 when no layers exist", async () => {
      const tx = mockTx({ aggregateRemaining: 0 });
      expect(await availableQty(tx, 1)).toBe(0);
    });

    it("scopes to warehouse when provided", async () => {
      const tx = mockTx({ aggregateRemaining: 10 });
      await availableQty(tx, 1, 3);
      expect(tx.inventoryLayer.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ itemId: 1, warehouseId: 3 }),
        })
      );
    });

    it("handles null _sum gracefully", async () => {
      const tx = mockTx({});
      tx.inventoryLayer.aggregate.mockResolvedValue({ _sum: { remaining: null } });
      expect(await availableQty(tx, 1)).toBe(0);
    });
  });

  describe("consumeFifoLayers", () => {
    it("returns zero when qty <= 0", async () => {
      const tx = mockTx({});
      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 0 });
      expect(result).toEqual({ consumedCost: 0, shortfall: 0 });
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it("consumes from a single layer (oldest first)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 100, unitCost: 5, batchNumber: null }],
      });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 20 });

      expect(result.consumedCost).toBe(20 * 5); // 100
      expect(result.shortfall).toBe(0);
      expect(tx._spies.layerUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { qtyOut: { increment: 20 }, remaining: { decrement: 20 } },
      });
    });

    it("consumes across multiple layers in FIFO order", async () => {
      const tx = mockTx({
        layers: [
          { id: 1, remaining: 10, unitCost: 4, batchNumber: null },
          { id: 2, remaining: 30, unitCost: 6, batchNumber: null },
        ],
      });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 25 });

      // 10@4 = 40, then 15@6 = 90 → total 130
      expect(result.consumedCost).toBe(130);
      expect(result.shortfall).toBe(0);
      expect(tx._spies.layerUpdate).toHaveBeenCalledTimes(2);
    });

    it("throws when insufficient stock and allowShortfall is false", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 5, unitCost: 10, batchNumber: null }],
      });

      await expect(consumeFifoLayers(tx, { itemId: 1, qty: 20 })).rejects.toThrow(
        "Stok tidak mencukupi"
      );
    });

    it("includes warehouse and label in shortfall error", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 2, unitCost: 10, batchNumber: null }],
      });

      await expect(
        consumeFifoLayers(tx, { itemId: 7, warehouseId: 3, qty: 20, label: "WO-001" })
      ).rejects.toThrow("di gudang #3");
    });

    it("returns shortfall when allowShortfall is true and stock is low", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 5, unitCost: 10, batchNumber: null }],
      });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 20, allowShortfall: true });

      expect(result.consumedCost).toBe(5 * 10); // 50
      expect(result.shortfall).toBe(15);
    });

    it("decrements matching batch lots", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 50, unitCost: 5, batchNumber: "BATCH-A" }],
        itemBatch: { id: 99, qty: 50 },
      });

      await consumeFifoLayers(tx, { itemId: 1, warehouseId: 2, qty: 10 });

      expect(tx._spies.batchUpdate).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { qty: { decrement: 10 } },
      });
    });

    it("marks oldest serials as used (auto FIFO) for serial-tracked items", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 11 }, { id: 12 }, { id: 13 }],
      });

      await consumeFifoLayers(tx, { itemId: 1, qty: 3 });

      expect(tx._spies.serialUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [11, 12, 13] } },
        data: { status: "used" },
      });
    });

    it("marks exactly the chosen serials (manual selection)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 21 }, { id: 22 }],
      });

      await consumeFifoLayers(tx, {
        itemId: 1,
        qty: 2,
        serialNumbers: ["SN-1", "SN-2"],
      });

      expect(tx.itemSerial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ serialNumber: { in: ["SN-1", "SN-2"] }, status: "available" }),
        })
      );
      expect(tx._spies.serialUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [21, 22] } },
        data: { status: "used" },
      });
    });

    it("throws when chosen serials are not all available", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 21 }], // only 1 found but 2 requested
      });

      await expect(
        consumeFifoLayers(tx, { itemId: 1, qty: 2, serialNumbers: ["SN-1", "SN-2"] })
      ).rejects.toThrow("Sebagian nomor seri tidak tersedia");
    });
  });

  describe("createInLayer", () => {
    it("creates an inbound layer with remaining = qty", async () => {
      const tx = mockTx({});

      await createInLayer(tx, {
        itemId: 1,
        warehouseId: 2,
        stockMoveId: 50,
        qty: 100,
        unitCost: 7.5,
      });

      expect(tx._spies.layerCreate).toHaveBeenCalledWith({
        data: {
          itemId: 1,
          warehouseId: 2,
          batchNumber: null,
          stockMoveId: 50,
          qtyIn: 100,
          qtyOut: 0,
          remaining: 100,
          unitCost: 7.5,
        },
      });
    });

    it("defaults warehouseId and batchNumber to null", async () => {
      const tx = mockTx({});

      await createInLayer(tx, { itemId: 1, stockMoveId: 50, qty: 10, unitCost: 3 });

      expect(tx._spies.layerCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ warehouseId: null, batchNumber: null }),
      });
    });
  });
});
