import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getSystemSettings: vi.fn(),
  generateDocumentNumber: vi.fn(),
  createJournal: vi.fn(),
}));

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

import { stockJournalService } from "@/lib/services/stock-journal.service";

const tx = {} as never;

// Full account config used by most tests.
const FULL_ACCOUNTS = {
  inventoryAccountId: 100,
  stockAdjustmentAccountId: 200,
  inventoryAdjustmentAccountId: null,
  cogsAccountId: 300,
  wipAccountId: 400,
  materialExpenseAccountId: 500,
  materialIssueExpenseAccountId: 510,
  purchaseInventoryAccountId: 600,
  purchaseReturnAccountId: 700,
  salesReturnAccountId: 800,
  purchaseShippingAccountId: 620,
  purchaseAdminFeeAccountId: 630,
};

describe("stockJournalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemSettings.mockResolvedValue(FULL_ACCOUNTS);
    mocks.generateDocumentNumber.mockResolvedValue("JRN-001");
    mocks.createJournal.mockResolvedValue({ id: 1, journalNumber: "JRN-001" });
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
      await stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1, 42, null, customDate);

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
      // Blended line: 1 unit @ 151000 (goods 130000 + ongkir 20000 + admin 1000).
      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 151000 }],
        "GR-1",
        1,
        42,
        null,
        undefined,
        [{ qty: 1, cost: 130000 }], // goods only
        [{ qty: 1, cost: 20000 }],  // ongkir
        [{ qty: 1, cost: 1000 }],   // admin bank
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
        [{ qty: 1, cost: 151000 }],
        "GR-1",
        1,
        42,
        null,
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
      // goods 100.00 + ongkir 3.333 + admin 6.667 = 110.00 exactly, but each
      // component is 3dp so naive float maths leaves a 0.001+ imbalance that
      // JournalService rejects. The rounded residual must absorb the difference.
      await stockJournalService.onGoodsReceipt(
        tx,
        [{ qty: 1, cost: 110 }],
        "GR-1",
        1,
        42,
        null,
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
        null,
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

  describe("onServiceGoodsReceipt (PRD FAB-08)", () => {
    it("posts Dr Material/Service Expense / Cr PurchaseInventory (no inventory debit)", async () => {
      await stockJournalService.onServiceGoodsReceipt(tx, [{ qty: 1, cost: 500000 }], "GR-9", 9, 42);

      const arg = mocks.createJournal.mock.calls[0][0];
      expect(arg.referenceType).toBe("GoodsReceipt");
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

    it("returns null when stockAdjustmentAccountId and inventoryAdjustmentAccountId are both null", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        stockAdjustmentAccountId: null,
        inventoryAdjustmentAccountId: null,
      });

      const result = await stockJournalService.onStockAdjustment(
        tx,
        [{ qty: 10, cost: 5, difference: 2 }],
        "ADJ-1",
        1
      );

      expect(result).toBeNull();
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

    it("returns null when no expense account configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({
        ...FULL_ACCOUNTS,
        materialIssueExpenseAccountId: null,
        materialExpenseAccountId: null,
        cogsAccountId: null,
      });

      const result = await stockJournalService.onMaterialIssue(tx, [{ qty: 5, cost: 8 }], "MI-1", 1);
      expect(result).toBeNull();
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
});
