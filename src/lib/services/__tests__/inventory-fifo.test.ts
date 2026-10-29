import { describe, it, expect, vi, beforeEach } from "vitest";
import { availableQty, consumeFifoLayers, createInLayer } from "@/lib/services/inventory-fifo";
import type { Prisma } from "@prisma/client";

// Build a mock transaction client. `$queryRaw` returns the locked layer rows.
function mockTx(opts: {
  aggregateRemaining?: number;
  layers?: { id: number; remaining: number; unitCost: number; batchNumber: string | null }[];
  trackSerial?: boolean;
  itemBatch?: { id: number; qty: number } | null;
  batches?: { id: number; batchNumber: string; qty: number; warehouseId: number; expiryDate: Date | null }[];
  availableSerials?: { id: number; serialNumber?: string }[];
  costingMethod?: string | null;
  categoryMethod?: string | null;
  globalMethod?: string | null;
}) {
  const layerUpdate = vi.fn().mockResolvedValue({});
  const batchUpdate = vi.fn().mockResolvedValue({});
  const serialUpdateMany = vi.fn().mockImplementation(({ where }: { where: { id?: { in?: number[] } } }) => Promise.resolve({ count: where?.id?.in?.length ?? 0 }));
  const layerCreate = vi.fn().mockResolvedValue({});
  const serialCount = vi.fn().mockImplementation(({ where }: { where: { id?: { in?: number[] } } }) => Promise.resolve(where?.id?.in?.length ?? 0));

  const tx = {
    inventoryLayer: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { remaining: opts.aggregateRemaining ?? 0 } }),
      update: layerUpdate,
      create: layerCreate,
    },
    $queryRaw: vi.fn().mockResolvedValue(opts.layers ?? []),
    itemBatch: {
      findMany: vi.fn().mockResolvedValue(
        opts.batches ??
          (opts.itemBatch ? [{ id: opts.itemBatch.id, batchNumber: "BATCH-A", qty: opts.itemBatch.qty, warehouseId: 2, expiryDate: null }] : []),
      ),
      update: batchUpdate,
    },
    item: {
      findUnique: vi.fn().mockResolvedValue({
        trackSerial: opts.trackSerial ?? false,
        costingMethod: opts.costingMethod ?? null,
        category: { costingMethod: opts.categoryMethod ?? null },
      }),
    },
    systemSetting: {
      findFirst: vi.fn().mockResolvedValue({ costingMethod: opts.globalMethod ?? "FIFO" }),
    },
    itemSerial: {
      findMany: vi.fn().mockResolvedValue(opts.availableSerials ?? []),
      updateMany: serialUpdateMany,
      count: serialCount,
    },
    _spies: { layerUpdate, batchUpdate, serialUpdateMany, layerCreate },
  };
  return tx as unknown as Prisma.TransactionClient & {
    inventoryLayer: {
      aggregate: typeof tx.inventoryLayer.aggregate
    };
    $queryRaw: typeof tx.$queryRaw;
    _spies: {
      layerUpdate: typeof layerUpdate;
      batchUpdate: typeof batchUpdate;
      serialUpdateMany: typeof serialUpdateMany;
      layerCreate: typeof layerCreate;
    };
  };
}

/** Skenario lapisan+lot bersama tes FEFO F-79 (lapisan tertua BATCH-LATE). */
function mockFefoTx() {
  return mockTx({
    layers: [
      { id: 1, remaining: 10, unitCost: 4, batchNumber: "BATCH-LATE" },
      { id: 2, remaining: 10, unitCost: 6, batchNumber: "BATCH-EARLY" },
    ],
    batches: [
      { id: 91, batchNumber: "BATCH-LATE", qty: 10, warehouseId: 2, expiryDate: new Date(2026, 5, 1) },
      { id: 92, batchNumber: "BATCH-EARLY", qty: 10, warehouseId: 2, expiryDate: new Date(2026, 1, 1) },
    ],
  });
}

/** Lot tunggal sederhana untuk tes penolakan/kedaluwarsa F-79. */
function mockSingleBatchTx(expiryDate: Date | null) {
  return mockTx({
    layers: [{ id: 1, remaining: 50, unitCost: 5, batchNumber: "BATCH-A" }],
    batches: [{ id: 99, batchNumber: "BATCH-A", qty: 50, warehouseId: 2, expiryDate }],
  });
}

/** Lapisan dua tingkat klasik bersama banyak tes costing (10@4 + 30@6). */
function mockTwoLayerTx(opts: Parameters<typeof mockTx>[0] = {}) {
  return mockTx({
    ...opts,
    layers: [
      { id: 1, remaining: 10, unitCost: 4, batchNumber: null },
      { id: 2, remaining: 30, unitCost: 6, batchNumber: null },
    ],
  });
}

/** Skenario serial bersama tes penolakan serial (availableSerials 1). */
function mockSerialTx() {
  return mockTx({
    layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
    trackSerial: true,
    availableSerials: [{ id: 21 }],
  });
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
      (tx.inventoryLayer.aggregate as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { remaining: null } });
      expect(await availableQty(tx, 1)).toBe(0);
    });
  });

  describe("consumeFifoLayers", () => {
    it("returns zero when qty <= 0", async () => {
      const tx = mockTx({});
      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 0 });
      expect(result).toEqual({ consumedCost: 0, shortfall: 0, consumedSerials: [], consumedBatches: [] });
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
      const tx = mockTwoLayerTx();

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 25 });

      // 10@4 = 40, then 15@6 = 90 → total 130
      expect(result.consumedCost).toBe(130);
      expect(result.shortfall).toBe(0);
      expect(tx._spies.layerUpdate).toHaveBeenCalledTimes(2);
    });

    it("average mode: books the weighted-average cost, not the oldest layer's cost", async () => {
      const tx = mockTwoLayerTx({ costingMethod: "average" });

      // Weighted average over the remaining layers: (10*4 + 30*6) / 40 = 220/40 = 5.5
      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 20 });

      expect(result.consumedCost).toBe(20 * 5.5); // 110 — NOT 20*4 (FIFO would be 10*4+10*6=100)
      expect(result.shortfall).toBe(0);
    });

    it("average: dua penjualan berurutan mempertahankan rata-rata tertimbang (Rp110 lalu Rp55)", async () => {
      // Stateful fake: layerUpdate benar-benar mengurangi remaining, sehingga
      // penjualan kedua menilai sisa stok yang ditinggalkan penjualan pertama.
      // Pengurasan FIFO lama menyisakan 20@6 → penjualan kedua Rp60 (drift).
      const layers = [
        { id: 1, remaining: 10, unitCost: 4, batchNumber: null as string | null, warehouseId: 1 },
        { id: 2, remaining: 30, unitCost: 6, batchNumber: null as string | null, warehouseId: 1 },
      ];
      const tx = {
        $queryRaw: vi.fn().mockImplementation(() =>
          Promise.resolve(layers.filter((l) => l.remaining > 0).map((l) => ({ ...l }))),
        ),
        inventoryLayer: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { remaining: 40 } }),
          update: vi.fn().mockImplementation(({ where, data }: { where: { id: number }; data: { remaining: { decrement: number } } }) => {
            const layer = layers.find((l) => l.id === where.id)!;
            layer.remaining -= data.remaining.decrement;
            return Promise.resolve({});
          }),
          create: vi.fn().mockResolvedValue({}),
        },
        itemBatch: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) },
        item: {
          findUnique: vi.fn().mockResolvedValue({
            trackSerial: false,
            costingMethod: "average",
            category: { costingMethod: null },
          }),
        },
        systemSetting: { findFirst: vi.fn().mockResolvedValue({ costingMethod: "FIFO" }) },
        itemSerial: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(0) },
      } as unknown as Prisma.TransactionClient;

      const first = await consumeFifoLayers(tx, { itemId: 1, qty: 20 });
      expect(first.consumedCost).toBe(110); // 20 × 5,5

      const second = await consumeFifoLayers(tx, { itemId: 1, qty: 10 });
      expect(second.consumedCost).toBe(55); // rata-rata sisa tetap 5,5 — bukan 6
    });

    it("category method overrides the item method (average via category)", async () => {
      const tx = mockTx({
        costingMethod: "fifo",
        categoryMethod: "average",
        layers: [{ id: 1, remaining: 100, unitCost: 7, batchNumber: null }],
      });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 10 });

      // average of a single layer is its own cost, but the point is the branch
      // was chosen by the category method, not the item method.
      expect(result.consumedCost).toBe(70);
    });

    it("defaults to fifo when neither item nor category nor global method is set", async () => {
      const tx = mockTwoLayerTx({ costingMethod: null, categoryMethod: null, globalMethod: "FIFO" });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 25 });

      // FIFO: 10@4 + 15@6 = 130
      expect(result.consumedCost).toBe(130);
    });

    it("jalur posting faktur MEMBACA pengaturan global: global average dipakai saat item/kategori kosong", async () => {
      const tx = mockTwoLayerTx({ costingMethod: null, categoryMethod: null, globalMethod: "average" });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 20 });

      // Rata-rata tertimbang: (10*4 + 30*6) / 40 = 5,5 → 20*5,5 = 110.
      // FIFO menghasilkan 10*4 + 10*6 = 100 — bila tes ini merah dengan 100,
      // jalur posting mengabaikan pengaturan global (hardcode FIFO).
      expect(result.consumedCost).toBe(110);
      expect(result.shortfall).toBe(0);
    });

    it("jalur posting faktur MENOLAK saat pengaturan global tak dikenal (fail-closed, pesan Indonesia)", async () => {
      const tx = mockTx({
        costingMethod: null,
        categoryMethod: null,
        globalMethod: "LIFO",
        layers: [{ id: 1, remaining: 100, unitCost: 5, batchNumber: null }],
      });

      await expect(consumeFifoLayers(tx, { itemId: 1, qty: 10 })).rejects.toThrow(
        /Metode penetapan biaya global .* tidak dikenal/,
      );
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

      const result = await consumeFifoLayers(tx, { itemId: 1, warehouseId: 2, qty: 10 });

      expect(result.consumedBatches).toEqual([{ batchNumber: "BATCH-A", warehouseId: 2, qty: 10 }]);

      expect(tx._spies.batchUpdate).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { qty: { decrement: 10 } },
      });
    });

    it("does not double-decrement same batch number across warehouses (warehouseId null)", async () => {
      // Two FIFO layers share batch "B1" but live in different warehouses.
      // Consuming 10 with warehouseId null draws 10 from the OLDEST (WH1) layer,
      // so only the WH1 batch lot must be decremented — not every lot named "B1".
      const batchUpdate = vi.fn().mockResolvedValue({});
      const tx = {
        inventoryLayer: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { remaining: 20 } }),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
        $queryRaw: vi.fn().mockResolvedValue([
          { id: 1, remaining: 10, unitCost: 5, batchNumber: "B1", warehouseId: 1 },
          { id: 2, remaining: 10, unitCost: 5, batchNumber: "B1", warehouseId: 2 },
        ]),
        itemBatch: {
          findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
            const all = [
              { id: 91, batchNumber: "B1", qty: 50, warehouseId: 1 },
              { id: 92, batchNumber: "B1", qty: 30, warehouseId: 2 },
            ];
            const bn = where.batchNumber as string | { in: string[] } | undefined;
            const matchesBatch = (b: { batchNumber: string }) =>
              bn && typeof bn === "object" && "in" in bn
                ? bn.in.includes(b.batchNumber)
                : b.batchNumber === bn;
            const wh = where.warehouseId as number | undefined;
            const matchesWh = (b: { warehouseId: number }) =>
              wh == null ? true : b.warehouseId === wh;
            return all.filter((b) => matchesBatch(b) && matchesWh(b));
          }),
          update: batchUpdate,
        },
        item: { findUnique: vi.fn().mockResolvedValue({ trackSerial: false }) },
        itemSerial: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      } as unknown as Prisma.TransactionClient;

      await consumeFifoLayers(tx, { itemId: 1, qty: 10 }); // warehouseId omitted (null)

      // Total decrement must equal consumed qty (10), only on the WH1 lot.
      expect(batchUpdate).toHaveBeenCalledTimes(1);
      expect(batchUpdate).toHaveBeenCalledWith({
        where: { id: 91 },
        data: { qty: { decrement: 10 } },
      });
    });

    it("rejects expired batch lot when documentDate is provided (F-79)", async () => {
      const tx = mockSingleBatchTx(new Date(2026, 0, 9));

      await expect(
        consumeFifoLayers(tx, { itemId: 1, warehouseId: 2, qty: 10, documentDate: new Date(2026, 0, 10) })
      ).rejects.toThrow(/BATCH-A.*kedaluwarsa/);
      expect(tx._spies.layerUpdate).not.toHaveBeenCalled();
      expect(tx._spies.batchUpdate).not.toHaveBeenCalled();
    });

    it("allows batch expiring exactly on the document date (F-79)", async () => {
      const tx = mockSingleBatchTx(new Date(2026, 0, 10));

      const result = await consumeFifoLayers(tx, {
        itemId: 1,
        warehouseId: 2,
        qty: 10,
        documentDate: new Date(2026, 0, 10),
      });
      expect(result.shortfall).toBe(0);
    });

    it("allows batch lot without expiryDate (F-79)", async () => {
      const tx = mockSingleBatchTx(null);

      const result = await consumeFifoLayers(tx, {
        itemId: 1,
        warehouseId: 2,
        qty: 10,
        documentDate: new Date(2026, 0, 10),
      });
      expect(result.consumedBatches).toEqual([{ batchNumber: "BATCH-A", warehouseId: 2, qty: 10 }]);
    });

    it("decrements physical batches in FEFO order without changing FIFO cost (F-79)", async () => {
      // Lapisan biaya tertua = BATCH-LATE (masuk lebih dulu), tetapi lot fisik
      // yang kedaluwarsa lebih cepat adalah BATCH-EARLY: dekremen fisik wajib
      // FEFO, biaya wajib tetap dari lapisan FIFO tertua.
      const tx = mockFefoTx();

      const result = await consumeFifoLayers(tx, {
        itemId: 1,
        warehouseId: 2,
        qty: 15,
        documentDate: new Date(2026, 0, 10),
      });

      // Biaya FIFO murni: 10@4 + 5@6 = 70 (bukan FEFO).
      expect(result.consumedCost).toBe(70);
      // Fisik FEFO: BATCH-EARLY habis dulu, lalu BATCH-LATE.
      expect(result.consumedBatches).toEqual([
        { batchNumber: "BATCH-EARLY", warehouseId: 2, qty: 10 },
        { batchNumber: "BATCH-LATE", warehouseId: 2, qty: 5 },
      ]);
      expect(tx._spies.batchUpdate).toHaveBeenCalledWith({
        where: { id: 92 },
        data: { qty: { decrement: 10 } },
      });
      expect(tx._spies.batchUpdate).toHaveBeenCalledWith({
        where: { id: 91 },
        data: { qty: { decrement: 5 } },
      });
    });

    it("keeps layer-precision batch decrement without documentDate (F-79)", async () => {
      const tx = mockFefoTx();

      const result = await consumeFifoLayers(tx, { itemId: 1, warehouseId: 2, qty: 15 });
      expect(result.consumedBatches).toEqual([
        { batchNumber: "BATCH-LATE", warehouseId: 2, qty: 10 },
        { batchNumber: "BATCH-EARLY", warehouseId: 2, qty: 5 },
      ]);
    });

    it("ignores expired lot with zero qty — live lot still issues (F-011)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 50, unitCost: 5, batchNumber: "BATCH-LIVE" }],
        batches: [
          { id: 98, batchNumber: "BATCH-DEAD", qty: 0, warehouseId: 2, expiryDate: new Date(2025, 0, 1) },
          { id: 99, batchNumber: "BATCH-LIVE", qty: 50, warehouseId: 2, expiryDate: new Date(2027, 0, 1) },
        ],
      });

      const result = await consumeFifoLayers(tx, {
        itemId: 1,
        warehouseId: 2,
        qty: 10,
        documentDate: new Date(2026, 0, 10),
      });
      expect(result.consumedCost).toBe(50);
      expect(result.consumedBatches).toEqual([{ batchNumber: "BATCH-LIVE", warehouseId: 2, qty: 10 }]);
    });

    it("rejects when a live-qty lot is expired even if another lot is valid (F-011)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 50, unitCost: 5, batchNumber: "BATCH-LIVE" }],
        batches: [
          { id: 98, batchNumber: "BATCH-EXP", qty: 5, warehouseId: 2, expiryDate: new Date(2025, 0, 1) },
          { id: 99, batchNumber: "BATCH-LIVE", qty: 50, warehouseId: 2, expiryDate: new Date(2027, 0, 1) },
        ],
      });

      await expect(
        consumeFifoLayers(tx, { itemId: 1, warehouseId: 2, qty: 10, documentDate: new Date(2026, 0, 10) })
      ).rejects.toThrow(/BATCH-EXP.*kedaluwarsa/);
      expect(tx._spies.layerUpdate).not.toHaveBeenCalled();
    });

    it("marks oldest serials as used (auto FIFO) for serial-tracked items", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [
          { id: 11, serialNumber: "SN-1" },
          { id: 12, serialNumber: "SN-2" },
          { id: 13, serialNumber: "SN-3" },
        ],
      });

      const result = await consumeFifoLayers(tx, { itemId: 1, qty: 3 });
      expect(result.consumedSerials).toEqual(["SN-1", "SN-2", "SN-3"]);

      expect(tx._spies.serialUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [11, 12, 13] }, status: "available" },
        data: { status: "used" },
      });
    });

    it("marks exactly the chosen serials (manual selection)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 21, serialNumber: "SN-1" }, { id: 22, serialNumber: "SN-2" }],
      });

      const result = await consumeFifoLayers(tx, {
        itemId: 1,
        qty: 2,
        serialNumbers: ["SN-1", "SN-2"],
      });
      expect(result.consumedSerials).toEqual(["SN-1", "SN-2"]);

      expect(tx.itemSerial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ serialNumber: { in: ["SN-1", "SN-2"] }, status: "available" }),
        })
      );
      expect(tx._spies.serialUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [21, 22] }, status: "available" },
        data: { status: "used" },
      });
    });

    it("throws when manual serial count does not match consumed quantity", async () => {
      const tx = mockSerialTx();

      await expect(
        consumeFifoLayers(tx, { itemId: 1, qty: 5, serialNumbers: ["SN-1"] }) // qty=5 but 1 serial
      ).rejects.toThrow(/tidak sesuai dengan kuantitas/);
    });

    it("throws when chosen serials have duplicates", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 21 }, { id: 22 }],
      });

      await expect(
        consumeFifoLayers(tx, { itemId: 1, qty: 2, serialNumbers: ["SN-1", "SN-1"] }) // duplicate
      ).rejects.toThrow(/Terdapat duplikasi/);
    });

    it("throws when chosen serials are not all available", async () => {
      const tx = mockSerialTx(); // only 1 found but 2 requested

      await expect(
        consumeFifoLayers(tx, { itemId: 1, qty: 2, serialNumbers: ["SN-1", "SN-2"] })
      ).rejects.toThrow("Sebagian nomor seri tidak tersedia");
    });

    it("konkuren: updateMany hanya klaim 1 dari 2 -> throw (TOCTOU serial)", async () => {
      const tx = mockTx({
        layers: [{ id: 1, remaining: 10, unitCost: 5, batchNumber: null }],
        trackSerial: true,
        availableSerials: [{ id: 21, serialNumber: "SN-1" }, { id: 22, serialNumber: "SN-2" }],
      });
      (tx._spies.serialUpdateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (tx.itemSerial.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      await expect(
        consumeFifoLayers(tx, { itemId: 1, qty: 2, serialNumbers: ["SN-1", "SN-2"] })
      ).rejects.toThrow("tidak tersedia/sudah terpakai");
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
