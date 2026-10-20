import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Presisi sen helper sumValue di stock-journal.service: nilai per baris
 * (qty * cost) dan akumulasinya dulu float mentah, jadi 17 baris 1x0.24 memberi
 * 4.080000000000002 yang lolos sebagai debit/kredit jurnal (onGoodsReceipt
 * membulatkan via round2 lokal, jalur lain tidak). Jurnal harus tepat sen.
 */
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

import { stockJournalService } from "@/lib/services/stock-journal.service";
import { seedStockJournalMocks } from "./stock-journal-test-utils";

const tx = {} as never;
const ITEMS_17 = Array.from({ length: 17 }, () => ({ qty: 1, cost: 0.24 }));

beforeEach(() => {
  vi.clearAllMocks();
  seedStockJournalMocks(mocks);
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
