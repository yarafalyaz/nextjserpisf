import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * BUG KERAS penerimaan campuran (barang + jasa).
 *
 * Satu penerimaan bisa memuat baris barang DAN baris jasa; hook
 * `onGoodsReceiptVerified` lalu memanggil DUA jurnal: `onGoodsReceipt`
 * (Dr Persediaan / Cr clearing) dan `onServiceGoodsReceipt` (Dr Beban Jasa /
 * Cr clearing). Tabel `journals` punya unique `(reference_type, reference_id)`
 * — dan kedua jurnal memakai `referenceType: "GoodsReceipt"` + `referenceId` yang
 * sama, sehingga jurnal kedua ditolak ("Duplicate entry 'GoodsReceipt-N' for key
 * 'journals.journals_reference_unique'") dan SELURUH transaksi verifikasi
 * rollback: penerimaan campuran tidak pernah bisa diverifikasi, stok tidak
 * bertambah, PO tetap partial, dan jurnal persediaannya pun ikut hilang.
 *
 * Test ini memakai `JournalService` yang ASLI (tidak di-mock) di atas `tx` palsu
 * yang menegakkan aturan unique itu persis seperti indeks DB — jadi test ini
 * memerahkan diri sendiri bila kedua penandanya kembali sama.
 */

const mocks = vi.hoisted(() => ({
  getSystemSettings: vi.fn(),
  generateDocumentNumber: vi.fn(),
}));

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}));

vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: mocks.generateDocumentNumber,
}));
vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: () => Promise.resolve(42) },
}));

import { stockJournalService } from "@/lib/services/stock-journal.service";

const ACCOUNTS = {
  inventoryAccountId: 100,
  purchaseInventoryAccountId: 600,
  purchaseShippingAccountId: null,
  purchaseAdminFeeAccountId: null,
  materialExpenseAccountId: 500,
  materialIssueExpenseAccountId: null,
  cogsAccountId: null,
};

interface FakeJournal {
  id: number;
  journalNumber: string;
  referenceType: string | null;
  referenceId: number | null;
  type: string;
  status: string;
  totalDebit: number;
  totalCredit: number;
}

/** `tx` palsu yang menegakkan unique (reference_type, reference_id) seperti DB. */
function makeTx() {
  const journals: FakeJournal[] = [];
  let seq = 0;
  const tx = {
    // R1: assertPeriodOpen baca kunci via $queryRaw — periode terbuka.
    $queryRaw: async () => [{ id: 1, period_lock_date: null }],
    $executeRaw: async () => 1,
    account: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) =>
        where.id.in.map((id: number) => ({ id })),
    },
    journal: {
      create: async ({ data }: { data: Omit<FakeJournal, "id"> }) => {
        const duplicate = journals.find(
          (j) =>
            j.referenceType === data.referenceType &&
            j.referenceId === data.referenceId,
        );
        if (duplicate) {
          throw new Error(
            `Duplicate entry '${data.referenceType}-${data.referenceId}' for key 'journals.journals_reference_unique'`,
          );
        }
        const row: FakeJournal = { id: ++seq, ...data };
        journals.push(row);
        return row;
      },
    },
    journalEntry: { createMany: async () => ({ count: 1 }) },
  };
  return { tx, journals };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSystemSettings.mockResolvedValue(ACCOUNTS);
  let n = 0;
  mocks.generateDocumentNumber.mockImplementation(async () => `JRN-${++n}`);
});

describe("penerimaan campuran barang+jasa", () => {
  it("menghasilkan dua jurnal yang sah untuk satu GR (tidak rollback)", async () => {
    const { tx, journals } = makeTx();
    const grId = 42;

    // Baris barang → jurnal persediaan.
    await stockJournalService.onGoodsReceipt(
      tx as never,
      [{ itemId: 1, qty: 2, cost: 1000 }],
      "GR-042",
      grId,
      7,
      new Date("2026-05-01"),
    );
    // Baris jasa → jurnal beban jasa, GR yang SAMA.
    await stockJournalService.onServiceGoodsReceipt(
      tx as never,
      [{ itemId: 2, qty: 1, cost: 250000 }],
      "GR-042",
      grId,
      7,
      new Date("2026-05-01"),
    );

    expect(journals).toHaveLength(2);
    expect(journals.map((j) => j.referenceType)).toEqual([
      "GoodsReceipt",
      "GoodsReceiptService",
    ]);
    // Keduanya tetap menunjuk penerimaan yang sama.
    expect(journals.every((j) => j.referenceId === grId)).toBe(true);

    // Jurnal persediaan mendebit persediaan; jurnal jasa mendebit beban.
    const inventoryJournal = journals[0];
    const serviceJournal = journals[1];
    expect(inventoryJournal.totalDebit).toBe(2000);
    expect(serviceJournal.totalDebit).toBe(250000);
  });

  it("menolak dua jurnal dengan penanda yang sama (aturan DB yang membuat bug ini)", async () => {
    // Menegaskan asumsi test di atas: bila penandanya sama, jurnal kedua gagal —
    // itulah jalur yang dulu membuat verifikasi penerimaan campuran rollback.
    const { tx } = makeTx();
    const journalData = {
      journalNumber: "JRN-X",
      transactionDate: new Date(),
      referenceType: "GoodsReceipt",
      referenceId: 43,
      type: "GR",
      status: "POSTED",
      totalDebit: 10,
      totalCredit: 10,
    };

    await tx.journal.create({ data: { ...journalData } });
    await expect(
      tx.journal.create({ data: { ...journalData, journalNumber: "JRN-Y" } }),
    ).rejects.toThrow(/journals_reference_unique/);
  });
});
