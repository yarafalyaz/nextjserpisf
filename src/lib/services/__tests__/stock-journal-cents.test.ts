import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Presisi sen helper sumValue di stock-journal.service: nilai per baris
 * (qty * cost) dan akumulasinya dulu float mentah, jadi 17 baris 1x0.24 memberi
 * 4.080000000000002 yang lolos sebagai debit/kredit jurnal (onGoodsReceipt
 * membulatkan via round2 lokal, jalur lain tidak). Jurnal harus tepat sen.
 */
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
const ITEMS_17 = Array.from({ length: 17 }, () => ({ qty: 1, cost: 0.24 }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSystemSettings.mockResolvedValue({
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
  });
  mocks.generateDocumentNumber.mockResolvedValue("JRN-001");
  mocks.createJournal.mockResolvedValue({ id: 1, journalNumber: "JRN-001" });
});

function entriesOf(call: number) {
  return mocks.createJournal.mock.calls[call][0].entries as {
    debit: number;
    credit: number;
  }[];
}

describe("stockJournalService (presisi sen sumValue)", () => {
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
