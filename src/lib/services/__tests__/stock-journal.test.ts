import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = await vi.hoisted(
  async () =>
    (await import("./stock-journal-test-utils")).createStockJournalMocks(),
);

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}));

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}));

vi.mock("@/lib/services/journal.service", () => ({
  JournalService: class {
    createJournal = mocks.createJournal;
  },
}));

import {
  stockJournalService,
  productionOrderCompletionJournalRef,
  productionOrderCostVarianceJournalRef,
  GR_LANDED_COST_WARNING_SHIPPING_BLENDED,
  GR_LANDED_COST_WARNING_ADMIN_ASSET_ACCOUNT,
} from "@/lib/services/stock-journal.service";
import {
  STOCK_JOURNAL_FULL_ACCOUNTS as FULL_ACCOUNTS,
  seedStockJournalMocks,
} from "./stock-journal-test-utils";

// `tx` palsu minimal: onGoodsReceipt membaca tipe akun di dalam transaksi
// (vonis Accountant F-2026-10-28-125-V V1/V2) untuk memutuskan sah/tidaknya
// memecah ongkir ke akun tersendiri. Default fixture: akun ongkir 620 bertipe
// aset persediaan, akun admin 630 bertipe beban.
const ACCOUNT_TYPE_BY_ID: Record<number, string> = {
  100: "ASSET",
  600: "ASSET",
  620: "ASSET",
  630: "EXPENSE",
};
const accountFindMany = vi.fn(
  async ({ where }: { where: { id: { in: number[] } } }) =>
    where.id.in.map((id) => ({ id, type: ACCOUNT_TYPE_BY_ID[id] ?? "EXPENSE" })),
);
const tx = { account: { findMany: accountFindMany } } as never;

describe("stockJournalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStockJournalMocks(mocks);
  });

  describe("onProductionOrderMaterialIssue", () => {
    it("posts material value from Inventory to WIP for every issue batch", async () => {
      await stockJournalService.onProductionOrderMaterialIssue(
        tx,
        [{ itemId: 2, qty: 3, cost: 12 }],
        "MO-2",
        77,
        42,
      );

      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        referenceType: "ProductionOrderMaterialIssue",
        referenceId: 77,
        type: "PROD",
        entries: [
          expect.objectContaining({ accountId: 400, debit: 36, credit: 0 }),
          expect.objectContaining({ accountId: 100, debit: 0, credit: 36 }),
        ],
      }));
    });

    it("refuses posting if WIP or Inventory account is not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, wipAccountId: null });
      await expect(stockJournalService.onProductionOrderMaterialIssue(
        tx,
        [{ qty: 1, cost: 10 }],
        "MO-2",
        77,
      )).rejects.toThrow("Akun Persediaan dan Barang Dalam Proses");
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("onProductionCostAbsorbed (non-material production cost → WIP)", () => {
    it("debits WIP and credits the absorption account for a positive amount", async () => {
      await stockJournalService.onProductionCostAbsorbed(tx, 300, "MO-9", 9, 42);
      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        referenceType: "ProductionCost",
        referenceId: 9,
        entries: [
          expect.objectContaining({ accountId: 400, debit: 300, credit: 0 }), // Dr WIP
          expect.objectContaining({ accountId: 500, debit: 0, credit: 300 }), // Cr absorption
        ],
      }));
    });

    it("reverses (Dr absorption / Cr WIP) for a negative amount", async () => {
      await stockJournalService.onProductionCostAbsorbed(tx, -300, "MO-9", 9, 42);
      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        entries: [
          expect.objectContaining({ accountId: 500, debit: 300, credit: 0 }),
          expect.objectContaining({ accountId: 400, debit: 0, credit: 300 }),
        ],
      }));
    });

    it("does nothing for a zero amount", async () => {
      const res = await stockJournalService.onProductionCostAbsorbed(tx, 0, "MO-9", 9, 42);
      expect(res).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("fails closed when WIP or the absorption account is unconfigured", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        wipAccountId: null,
        materialExpenseAccountId: null,
        materialIssueExpenseAccountId: null,
        cogsAccountId: null,
      });
      await expect(
        stockJournalService.onProductionCostAbsorbed(tx, 300, "MO-9", 9, 42),
      ).rejects.toThrow("Barang Dalam Proses");
    });
  });

  describe("onProductionOrderCompleted", () => {
    it("debits finished goods and credits WIP when a production order completes", async () => {
      await stockJournalService.onProductionOrderCompleted(
        tx,
        [{ qty: 1, cost: 125 }],
        "MO-9",
        9,
        42,
      );

      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        referenceType: "ProductionOrder",
        referenceId: 9,
        entries: [
          expect.objectContaining({ accountId: 100, debit: 125, credit: 0 }),
          expect.objectContaining({ accountId: 400, debit: 0, credit: 125 }),
        ],
      }));
    });

    it("requires WIP and inventory accounts for completion", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, inventoryAccountId: null });
      await expect(stockJournalService.onProductionOrderCompleted(
        tx,
        [{ qty: 1, cost: 125 }],
        "MO-9",
        9,
      )).rejects.toThrow("Akun Persediaan dan Barang Dalam Proses");
    });

    it("keys each partial release by its stock move so the 2nd release cannot trip the journal unique index", async () => {
      await stockJournalService.onProductionOrderCompleted(
        tx,
        [{ qty: 4, cost: 100 }],
        "MO-9",
        9,
        42,
        undefined,
        456,
      );
      await stockJournalService.onProductionOrderCompleted(
        tx,
        [{ qty: 6, cost: 100 }],
        "MO-9",
        9,
        42,
        undefined,
        457,
      );

      const keys = mocks.createJournal.mock.calls.map((call) => {
        const arg = call[0];
        return `${String(arg.referenceType)}|${String(arg.referenceId)}`;
      });
      expect(keys).toEqual(["ProductionOrder_456|9", "ProductionOrder_457|9"]);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("onProductionOrderCostRoundingVariance", () => {
    it("debits the variance expense when actual WIP is above rounded stock value", async () => {
      await stockJournalService.onProductionOrderCostRoundingVariance(tx, 0.01, "MO-9", 9);
      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        referenceType: "ProductionOrderCostVariance",
        referenceId: 9,
        entries: [
          expect.objectContaining({ accountId: 500, debit: 0.01, credit: 0 }),
          expect.objectContaining({ accountId: 400, debit: 0, credit: 0.01 }),
        ],
      }));
    });

    it("credits the variance expense when rounded stock value is above actual WIP", async () => {
      await stockJournalService.onProductionOrderCostRoundingVariance(tx, -0.01, "MO-9", 9);
      expect(mocks.createJournal).toHaveBeenCalledWith(expect.objectContaining({
        entries: [
          expect.objectContaining({ accountId: 400, debit: 0.01, credit: 0 }),
          expect.objectContaining({ accountId: 500, debit: 0, credit: 0.01 }),
        ],
      }));
    });

    it("keys each partial release variance by its stock move so the 2nd release cannot trip the journal unique index", async () => {
      await stockJournalService.onProductionOrderCostRoundingVariance(tx, 0.01, "MO-9", 9, 42, undefined, 456);
      await stockJournalService.onProductionOrderCostRoundingVariance(tx, -0.01, "MO-9", 9, 42, undefined, 457);

      const keys = mocks.createJournal.mock.calls.map((call) => {
        const arg = call[0];
        return `${String(arg.referenceType)}|${String(arg.referenceId)}`;
      });
      expect(keys).toEqual(["ProductionOrderCostVariance_456|9", "ProductionOrderCostVariance_457|9"]);
      expect(new Set(keys).size).toBe(keys.length);
      expect(productionOrderCostVarianceJournalRef(457)).toBe("ProductionOrderCostVariance_457");
      expect(productionOrderCompletionJournalRef(457)).toBe("ProductionOrder_457");
    });
  });

  describe("onGoodsReceipt", () => {
    it("creates balanced Dr Inventory / Cr PurchaseInventory journal", async () => {
      await stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1, 42);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: "GoodsReceipt",
          type: "GR",
          entries: [
            expect.objectContaining({ accountId: 100, debit: 50, credit: 0 }),
            expect.objectContaining({ accountId: 600, debit: 0, credit: 50 }),
          ],
        })
      );
    });

    it("uses passed transactionDate when provided", async () => {
      const customDate = new Date("2026-05-15T00:00:00Z");
      await stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1, 42, customDate);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: "GoodsReceipt",
          transactionDate: customDate,
        })
      );
    });

    it("throws when inventory account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, inventoryAccountId: null });

      await expect(
        stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1),
      ).rejects.toThrow("Akun Persediaan");
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("throws when purchase clearing account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, purchaseInventoryAccountId: null });

      await expect(
        stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1),
      ).rejects.toThrow("Clearing Pembelian");
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onGoodsReceipt(tx, [{ qty: 0, cost: 0 }], "GR-1", 1);
      expect(result).toBeNull();
    });

    it("splits the debit into Persediaan + Ongkir + Beban Admin when components are supplied", async () => {
      // V3 vonis 125-V: `items` hanya nilai yang DIKAPITALISASI (barang +
      // ongkir = 150000); admin bank 1000 dijurnal terpisah sebagai beban
      // periode, sehingga kredit clearing = 151000.
      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 150000 }],
        "GR-1",
        1,
        42,
        undefined,
        [{ qty: 1, cost: 130000 }], // goods only
        [{ qty: 1, cost: 20000 }],  // ongkir
        [{ qty: 1, cost: 1000 }],   // admin bank (beban periode)
      );

      const call = mocks.createJournal.mock.calls[0][0];
      // Debits sum to the credit (balanced)
      const debits = call.entries
        .filter((e: { debit: number }) => e.debit > 0)
        .reduce((s: number, e: { debit: number }) => s + e.debit, 0);
      expect(debits).toBe(151000);
      expect(call.entries).toEqual([
        expect.objectContaining({ accountId: 100, debit: 130000, credit: 0 }),
        expect.objectContaining({ accountId: 620, debit: 20000, credit: 0 }),
        expect.objectContaining({ accountId: 630, debit: 1000, credit: 0 }),
        expect.objectContaining({ accountId: 600, debit: 0, credit: 151000 }),
      ]);
    });

    it("folds the shipping line back into Persediaan when no shipping account is set", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        purchaseShippingAccountId: null,
      });

      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 150000 }],
        "GR-1",
        1,
        42,
        undefined,
        [{ qty: 1, cost: 130000 }],
        [{ qty: 1, cost: 20000 }],
        [{ qty: 1, cost: 1000 }],
      );

      const call = mocks.createJournal.mock.calls[0][0];
      // Goods + shipping folded → 150000 inventory debit, admin still separate.
      expect(call.entries).toEqual([
        expect.objectContaining({ accountId: 100, debit: 150000, credit: 0 }),
        expect.objectContaining({ accountId: 630, debit: 1000, credit: 0 }),
        expect.objectContaining({ accountId: 600, debit: 0, credit: 151000 }),
      ]);
    });

    it("keeps the split balanced to the cent when freight/admin carry sub-cent amounts", async () => {
      // V3: items = barang 100 + ongkir 3.333 = 103.333 (dibulatkan 103.33);
      // admin 6.667 dijurnal terpisah (6.67). Kredit clearing = 110.00 dan
      // Σdebit = 103.33 + 6.67 = 110.00 tepat — tidak ada selisih > 0.001.
      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 103.333 }],
        "GR-1",
        1,
        42,
        undefined,
        [{ qty: 1, cost: 100 }],
        [{ qty: 1, cost: 3.333 }],
        [{ qty: 1, cost: 6.667 }],
      );

      const call = mocks.createJournal.mock.calls[0][0];
      const debits = call.entries
        .filter((e: { debit: number }) => e.debit > 0)
        .reduce((s: number, e: { debit: number }) => s + e.debit, 0);
      const credits = call.entries
        .filter((e: { credit: number }) => e.credit > 0)
        .reduce((s: number, e: { credit: number }) => s + e.credit, 0);
      expect(Math.abs(debits - credits)).toBeLessThan(0.001);
      expect(debits).toBe(110);
      // Inventory absorbs the rounded residual.
      expect(call.entries[0]).toEqual(
        expect.objectContaining({ accountId: 100, debit: 100, credit: 0 }),
      );
    });

    it("falls back to a single blended Inventory debit when no split is supplied", async () => {
      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 151000 }],
        "GR-1",
        1,
        42,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      const call = mocks.createJournal.mock.calls[0][0];
      expect(call.entries).toEqual([
        expect.objectContaining({ accountId: 100, debit: 151000, credit: 0 }),
        expect.objectContaining({ accountId: 600, debit: 0, credit: 151000 }),
      ]);
    });
  });


  // ════════════════════════════════════════════════════════════════════════════
  // E125 — falsifikasi vonis Accountant F-2026-10-28-125-V (PUR-BR-008).
  // Sebelum koreksi ini seluruh poin di blok ini MERAH: akun ongkir bertipe beban
  // (600014 EXPS) dipakai sebagai akun split padahal nilainya sudah masuk
  // InventoryLayer, dan biaya admin bank dikapitalisasi sambil tetap dibebankan
  // di pembayaran (dobel saat barang dijual).
  // ════════════════════════════════════════════════════════════════════════════
  describe("onGoodsReceipt — vonis 125-V (PUR-BR-008) V1/V2/V3/V10", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      seedStockJournalMocks(mocks);
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it("E125-1: akun ongkir bertipe BEBAN tidak dipakai split — ongkir masuk Persediaan + peringatan bernama", async () => {
      // 600014 Beban Ekspedisi = EXPS. Nilai ongkir sudah ada di InventoryLayer,
      // jadi mendebit akun beban membuat GL < subledger dan HPP dobel saat jual.
      ACCOUNT_TYPE_BY_ID[620] = "EXPENSE";
      try {
        mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS });

        await stockJournalService.onGoodsReceipt(
          tx,
          [{ qty: 1, cost: 150000 }],
          "GR-1",
          1,
          42,
          undefined,
          [{ qty: 1, cost: 130000 }],
          [{ qty: 1, cost: 20000 }],
          undefined,
        );

        const call = mocks.createJournal.mock.calls[0][0];
        // Tidak ada debit ke akun beban 620 sama sekali.
        expect(
          call.entries.some(
            (e: { accountId: number; debit: number }) => e.accountId === 620 && e.debit > 0,
          ),
        ).toBe(false);
        // Persediaan menyerap barang + ongkir (150000) dan kredit tetap seimbang.
        expect(call.entries).toEqual([
          expect.objectContaining({ accountId: 100, debit: 150000, credit: 0 }),
          expect.objectContaining({ accountId: 600, debit: 0, credit: 150000 }),
        ]);
        expect(console.warn).toHaveBeenCalledWith(GR_LANDED_COST_WARNING_SHIPPING_BLENDED);
      } finally {
        ACCOUNT_TYPE_BY_ID[620] = "ASSET";
      }
    });

    it("E125-4: akun ongkir kosong → blended WAJIB berisik (peringatan bernama)", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        purchaseShippingAccountId: null,
      });

      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 150000 }],
        "GR-1",
        1,
        42,
        undefined,
        [{ qty: 1, cost: 130000 }],
        [{ qty: 1, cost: 20000 }],
        undefined,
      );

      const call = mocks.createJournal.mock.calls[0][0];
      expect(call.entries).toEqual([
        expect.objectContaining({ accountId: 100, debit: 150000, credit: 0 }),
        expect.objectContaining({ accountId: 600, debit: 0, credit: 150000 }),
      ]);
      // Blended tanpa peringatan = temuan vonis V2. Peringatan WAJIB muncul.
      expect(console.warn).toHaveBeenCalledWith(GR_LANDED_COST_WARNING_SHIPPING_BLENDED);
    });

    it("V3 fail-closed: admin fee > 0 tanpa akun beban admin = ditolak, bukan dikapitalisasi diam-diam", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        purchaseAdminFeeAccountId: null,
      });

      await expect(
        stockJournalService.onGoodsReceipt(
          tx,
          [{ qty: 1, cost: 130000 }],
          "GR-1",
          1,
          42,
          undefined,
          [{ qty: 1, cost: 130000 }],
          undefined,
          [{ qty: 1, cost: 1000 }],
        ),
      ).rejects.toThrow(/beban admin bank/i);
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("V3 peringatan: akun admin dipetakan ke ASSET → tetap beban, tetapi berisik", async () => {
      ACCOUNT_TYPE_BY_ID[630] = "ASSET";
      try {
        mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS });

        await stockJournalService.onGoodsReceipt(
          tx,
          [{ qty: 1, cost: 130000 }],
          "GR-1",
          1,
          42,
          undefined,
          [{ qty: 1, cost: 130000 }],
          undefined,
          [{ qty: 1, cost: 1000 }],
        );

        const call = mocks.createJournal.mock.calls[0][0];
        // Tetap didebit ke akun admin (bukan digabung ke Persediaan)...
        expect(call.entries).toEqual([
          expect.objectContaining({ accountId: 100, debit: 130000, credit: 0 }),
          expect.objectContaining({ accountId: 630, debit: 1000, credit: 0 }),
          expect.objectContaining({ accountId: 600, debit: 0, credit: 131000 }),
        ]);
        // ...dan pemetaan yang salah tipe wajib berisik.
        expect(console.warn).toHaveBeenCalledWith(GR_LANDED_COST_WARNING_ADMIN_ASSET_ACCOUNT);
      } finally {
        ACCOUNT_TYPE_BY_ID[630] = "EXPENSE";
      }
    });

    it("E125-5/V10: debit Persediaan = Σ(qty×cost) nilai stok yang ditulis ke layer, admin di luar", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS });
      // Dua baris barang; nilai stok = 2×1033.33 + 1×250.00 (ongkir sudah termasuk).
      const capitalised = [
        { qty: 2, cost: 1033.33 },
        { qty: 1, cost: 250 },
      ];
      const goodsOnly = [
        { qty: 2, cost: 1000 },
        { qty: 1, cost: 250 },
      ];
      const freight = [{ qty: 2, cost: 33.33 }];

      await stockJournalService.onGoodsReceipt(
        tx,
        capitalised,
        "GR-1",
        1,
        42,
        undefined,
        goodsOnly,
        freight,
        [{ qty: 1, cost: 1500 }],
      );

      const call = mocks.createJournal.mock.calls[0][0];
      const layerValue = capitalised.reduce((s, l) => s + l.qty * l.cost, 0);
      // V10: saldo GL persediaan = akun persediaan induk (100) + sub-akun
      // ongkir bertipe aset (620) — keduanya bertipe ASSET, jadi totalnya
      // wajib sama dengan Σ nilai layer.
      const inventoryDebit = call.entries
        .filter((e: { accountId: number }) => e.accountId === 100 || e.accountId === 620)
        .reduce((s: number, e: { debit: number }) => s + e.debit, 0);
      // GL persediaan == Σ nilai layer (selisih 0), admin 1500 TIDAK di dalamnya.
      expect(inventoryDebit).toBe(layerValue);
      const debits = call.entries.reduce((s: number, e: { debit: number }) => s + e.debit, 0);
      const credits = call.entries.reduce((s: number, e: { credit: number }) => s + e.credit, 0);
      expect(Math.abs(debits - credits)).toBeLessThan(0.001);
      expect(credits).toBe(layerValue + 1500);
    });
  });

  describe("onServiceGoodsReceipt (PRD FAB-08)", () => {
    it("posts Dr Material/Service Expense / Cr PurchaseInventory (no inventory debit)", async () => {
      await stockJournalService.onServiceGoodsReceipt(tx, [{ qty: 1, cost: 500000 }], "GR-9", 9, 42);

      const arg = mocks.createJournal.mock.calls[0][0];
      // Penanda WAJIB berbeda dari jurnal barang ("GoodsReceipt"): tabel journals
      // unik pada (reference_type, reference_id), sehingga penanda yang sama
      // membuat jurnal jasa ditolak dan verifikasi penerimaan campuran
      // barang+jasa selalu rollback.
      expect(arg.referenceType).toBe("GoodsReceiptService");
      expect(arg.referenceId).toBe(9);
      expect(arg.type).toBe("GR");
      // Debits the expense account (500), NOT inventory (100); credits clearing (600).
      expect(arg.entries).toEqual([
        expect.objectContaining({ accountId: 500, debit: 500000, credit: 0 }),
        expect.objectContaining({ accountId: 600, debit: 0, credit: 500000 }),
      ]);
      expect(arg.entries.some((e: { accountId: number }) => e.accountId === 100)).toBe(false);
    });

    it("falls back to materialIssueExpense then cogs when materialExpense is unset", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialExpenseAccountId: null,
        materialIssueExpenseAccountId: 510,
      });

      await stockJournalService.onServiceGoodsReceipt(tx, [{ qty: 2, cost: 100 }], "GR-9", 9);

      const arg = mocks.createJournal.mock.calls[0][0];
      expect(arg.entries[0]).toEqual(expect.objectContaining({ accountId: 510, debit: 200 }));
    });

    it("throws when no expense account is configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialExpenseAccountId: null,
        materialIssueExpenseAccountId: null,
        cogsAccountId: null,
      });

      await expect(
        stockJournalService.onServiceGoodsReceipt(tx, [{ qty: 1, cost: 5 }], "GR-9", 9),
      ).rejects.toThrow("Akun beban");
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("onStockAdjustment", () => {
    it("posts Dr Inventory / Cr StockAdj on net increase", async () => {
      await stockJournalService.onStockAdjustment(
        tx,
        [{ qty: 10, cost: 5, difference: 4 }],
        "ADJ-1",
        1
      );

      // netValue = 4*5 = 20 → increase
      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ADJ",
          entries: [
            expect.objectContaining({ accountId: 100, debit: 20, credit: 0 }),
            expect.objectContaining({ accountId: 200, debit: 0, credit: 20 }),
          ],
        })
      );
    });

    it("posts Dr StockAdj / Cr Inventory on net decrease", async () => {
      await stockJournalService.onStockAdjustment(
        tx,
        [{ qty: 10, cost: 5, difference: -4 }],
        "ADJ-1",
        1
      );

      // netValue = -20 → decrease, absValue 20
      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [
            expect.objectContaining({ accountId: 200, debit: 20, credit: 0 }),
            expect.objectContaining({ accountId: 100, debit: 0, credit: 20 }),
          ],
        })
      );
    });

    it("returns null when net value is zero", async () => {
      const result = await stockJournalService.onStockAdjustment(
        tx,
        [{ qty: 10, cost: 5, difference: 0 }],
        "ADJ-1",
        1
      );
      expect(result).toBeNull();
    });

    it("falls back to inventoryAdjustmentAccountId when stockAdjustmentAccountId is null", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        stockAdjustmentAccountId: null,
        inventoryAdjustmentAccountId: 250,
      });

      await stockJournalService.onStockAdjustment(
        tx,
        [{ qty: 10, cost: 5, difference: 2 }],
        "ADJ-1",
        1
      );

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ accountId: 250, credit: 10 }),
          ]),
        })
      );
    });

    it("fails closed when stockAdjustmentAccountId and inventoryAdjustmentAccountId are both null", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        stockAdjustmentAccountId: null,
        inventoryAdjustmentAccountId: null,
      });

      await expect(
        stockJournalService.onStockAdjustment(
          tx,
          [{ qty: 10, cost: 5, difference: 2 }],
          "ADJ-1",
          1
        )
      ).rejects.toThrow("Penyesuaian Stok");

      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("onMaterialIssue", () => {
    it("posts Dr MaterialIssueExpense / Cr Inventory", async () => {
      await stockJournalService.onMaterialIssue(tx, [{ qty: 5, cost: 8 }], "MI-1", 1);

      // expense account = materialIssueExpense (510), total = 40
      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "MI",
          entries: [
            expect.objectContaining({ accountId: 510, debit: 40, credit: 0 }),
            expect.objectContaining({ accountId: 100, debit: 0, credit: 40 }),
          ],
        })
      );
    });

    it("falls back to cogs when material expense accounts are null", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialIssueExpenseAccountId: null,
        materialExpenseAccountId: null,
      });

      await stockJournalService.onMaterialIssue(tx, [{ qty: 5, cost: 8 }], "MI-1", 1);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ accountId: 300, debit: 40 }),
          ]),
        })
      );
    });

    it("fails closed when no expense account configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialIssueExpenseAccountId: null,
        materialExpenseAccountId: null,
        cogsAccountId: null,
      });

      await expect(
        stockJournalService.onMaterialIssue(tx, [{ qty: 5, cost: 8 }], "MI-1", 1)
      ).rejects.toThrow("Beban Material");
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("falls back to materialExpense when materialIssueExpense is null", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialIssueExpenseAccountId: null,
      });

      await stockJournalService.onMaterialIssue(tx, [{ qty: 5, cost: 8 }], "MI-1", 1);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ accountId: 500, debit: 40 }),
          ]),
        })
      );
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onMaterialIssue(tx, [{ qty: 0, cost: 8 }], "MI-1", 1);
      expect(result).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("onSalesReturn", () => {
    it("posts Dr Inventory / Cr SalesReturn", async () => {
      await stockJournalService.onSalesReturn(tx, [{ qty: 2, cost: 100 }], "SR-1", 1);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SR",
          entries: [
            expect.objectContaining({ accountId: 100, debit: 200, credit: 0 }),
            expect.objectContaining({ accountId: 800, debit: 0, credit: 200 }),
          ],
        })
      );
    });

    it("returns null when salesReturn account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, salesReturnAccountId: null });
      const result = await stockJournalService.onSalesReturn(tx, [{ qty: 2, cost: 100 }], "SR-1", 1);
      expect(result).toBeNull();
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onSalesReturn(tx, [{ qty: 0, cost: 100 }], "SR-1", 1);
      expect(result).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("onPurchaseReturn", () => {
    it("posts Dr PurchaseReturn / Cr Inventory", async () => {
      await stockJournalService.onPurchaseReturn(tx, [{ qty: 3, cost: 20 }], "PR-1", 1);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "PR",
          entries: [
            expect.objectContaining({ accountId: 700, debit: 60, credit: 0 }),
            expect.objectContaining({ accountId: 100, debit: 0, credit: 60 }),
          ],
        })
      );
    });

    it("returns null when purchaseReturn account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, purchaseReturnAccountId: null });
      const result = await stockJournalService.onPurchaseReturn(tx, [{ qty: 3, cost: 20 }], "PR-1", 1);
      expect(result).toBeNull();
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onPurchaseReturn(tx, [{ qty: 0, cost: 20 }], "PR-1", 1);
      expect(result).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });

  describe("presisi sen sumValue", () => {
    const ITEMS_17 = Array.from({ length: 17 }, () => ({ qty: 1, cost: 0.24 }));

    function entriesOf(call: number) {
      return mocks.createJournal.mock.calls[call][0].entries as {
        debit: number;
        credit: number;
      }[];
    }

    it("jurnal penerimaan jasa 17 baris 1x0.24 tepat 4.08, bukan 4.080000000000002", async () => {
      await stockJournalService.onServiceGoodsReceipt(tx, ITEMS_17, "GR-1", 7);

      const entries = entriesOf(0);
      expect(entries[0].debit).toBe(4.08);
      expect(entries[1].credit).toBe(4.08);
    });

    it("jurnal issue material ke WIP 17 baris 1x0.24 tepat 4.08 di kedua sisi", async () => {
      await stockJournalService.onProductionOrderMaterialIssue(tx, ITEMS_17, "MO-1", 7);

      const entries = entriesOf(0);
      expect(entries[0].debit).toBe(4.08);
      expect(entries[1].credit).toBe(4.08);
    });

    it("nilai per baris tak bulat sen dibulatkan per sen: 3 baris 1x0.335 tepat 1.02", async () => {
      await stockJournalService.onServiceGoodsReceipt(
        tx,
        [
          { qty: 1, cost: 0.335 },
          { qty: 1, cost: 0.335 },
          { qty: 1, cost: 0.335 },
        ],
        "GR-2",
        8,
      );

      const entries = entriesOf(0);
      expect(entries[0].debit).toBe(1.02);
      expect(entries[1].credit).toBe(1.02);
    });
  });
});
