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
};

describe("stockJournalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemSettings.mockResolvedValue(FULL_ACCOUNTS);
    mocks.generateDocumentNumber.mockResolvedValue("JRN-001");
    mocks.createJournal.mockResolvedValue({ id: 1, journalNumber: "JRN-001" });
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

    it("returns null when inventory account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, inventoryAccountId: null });

      const result = await stockJournalService.onGoodsReceipt(tx, [{ qty: 10, cost: 5 }], "GR-1", 1);

      expect(result).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onGoodsReceipt(tx, [{ qty: 0, cost: 0 }], "GR-1", 1);
      expect(result).toBeNull();
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

  describe("onWorkOrderCompleted", () => {
    it("posts Dr WIP / Cr Inventory", async () => {
      await stockJournalService.onWorkOrderCompleted(tx, [{ qty: 4, cost: 25 }], "WO-1", 1);

      expect(mocks.createJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "WO",
          entries: [
            expect.objectContaining({ accountId: 400, debit: 100, credit: 0 }),
            expect.objectContaining({ accountId: 100, debit: 0, credit: 100 }),
          ],
        })
      );
    });

    it("returns null when WIP account not configured", async () => {
      mocks.getSystemSettings.mockResolvedValue({ ...FULL_ACCOUNTS, wipAccountId: null });
      const result = await stockJournalService.onWorkOrderCompleted(tx, [{ qty: 4, cost: 25 }], "WO-1", 1);
      expect(result).toBeNull();
    });

    it("returns null when total value is zero", async () => {
      const result = await stockJournalService.onWorkOrderCompleted(tx, [{ qty: 0, cost: 25 }], "WO-1", 1);
      expect(result).toBeNull();
      expect(mocks.createJournal).not.toHaveBeenCalled();
    });
  });
});
