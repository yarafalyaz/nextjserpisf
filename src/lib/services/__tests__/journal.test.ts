import { describe, it, expect, vi } from "vitest";
import { JournalService } from "@/lib/services/journal.service";

// Build a mock prisma-like client whose $transaction runs the callback with a mock tx.
function buildService(txOverrides: Record<string, unknown> = {}) {
  const spies = {
    accountFindMany: vi.fn(),
    journalCreate: vi.fn(),
    journalEntryCreateMany: vi.fn(),
    journalFindUniqueOrThrow: vi.fn(),
    journalUpdate: vi.fn(),
  };

  const tx = {
    account: { findMany: spies.accountFindMany },
    journal: {
      create: spies.journalCreate,
      findUniqueOrThrow: spies.journalFindUniqueOrThrow,
      update: spies.journalUpdate,
    },
    journalEntry: { createMany: spies.journalEntryCreateMany },
    ...txOverrides,
  };

  const prismaLike = {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as never;

  return { service: new JournalService(prismaLike), spies };
}

describe("JournalService", () => {
  describe("createJournal", () => {
    it("throws when no entries provided", async () => {
      const { service } = buildService();
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [],
        })
      ).rejects.toThrow("minimal 1 entry");
    });

    it("throws when debit != credit (not balanced)", async () => {
      const { service } = buildService();
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 90 },
          ],
        })
      ).rejects.toThrow("tidak balance");
    });

    it("throws when an entry has negative debit/credit", async () => {
      const { service } = buildService();
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: -10, credit: 0 },
            { accountId: 2, debit: 0, credit: -10 },
          ],
        })
      ).rejects.toThrow("tidak boleh negatif");
    });

    it("throws when an entry has both debit and credit zero", async () => {
      const { service } = buildService();
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: 0, credit: 0 },
            { accountId: 2, debit: 0, credit: 0 },
          ],
        })
      ).rejects.toThrow("harus memiliki nilai Debit atau Credit");
    });

    it("throws when an entry has both debit and credit non-zero", async () => {
      const { service } = buildService();
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: 50, credit: 50 },
            { accountId: 2, debit: 0, credit: 0 },
          ],
        })
      ).rejects.toThrow();
    });

    it("throws when an account does not exist", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([{ id: 1 }]); // only 1 of 2

      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).rejects.toThrow("Account tidak ditemukan: 2");
    });

    it("creates a balanced journal with entries", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      spies.journalCreate.mockResolvedValue({ id: 99, journalNumber: "JRN-1" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });

      const result = await service.createJournal({
        journalNumber: "JRN-1",
        transactionDate: new Date("2026-06-09"),
        type: "sales",
        referenceType: "Invoice",
        referenceId: 5,
        entries: [
          { accountId: 1, debit: 100, credit: 0, memo: "AR" },
          { accountId: 2, debit: 0, credit: 100, memo: "Revenue" },
        ],
      });

      expect(result).toEqual({ id: 99, journalNumber: "JRN-1" });
      expect(spies.journalCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          journalNumber: "JRN-1",
          status: "POSTED",
          totalDebit: 100,
          totalCredit: 100,
          referenceType: "Invoice",
          referenceId: 5,
        }),
      });
      expect(spies.journalEntryCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ journalId: 99, accountId: 1, debit: 100, credit: 0 }),
          expect.objectContaining({ journalId: 99, accountId: 2, debit: 0, credit: 100 }),
        ],
      });
    });

    it("accepts tiny floating-point imbalance within epsilon", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      spies.journalCreate.mockResolvedValue({ id: 1, journalNumber: "JRN-1" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });

      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "manual",
          entries: [
            { accountId: 1, debit: 100.0005, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).resolves.toEqual({ id: 1, journalNumber: "JRN-1" });
    });
  });

  describe("reverseJournal", () => {
    it("throws when journal is already reversed", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1, journalNumber: "JRN-1", status: "REVERSED", entries: [],
      });

      await expect(service.reverseJournal(1, "REV-1")).rejects.toThrow("sudah di-reverse");
    });

    it("creates a reversal journal with swapped debit/credit", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1,
        journalNumber: "JRN-1",
        status: "POSTED",
        type: "sales",
        totalDebit: 100,
        totalCredit: 100,
        entries: [
          { accountId: 1, debit: 100, credit: 0, memo: "AR" },
          { accountId: 2, debit: 0, credit: 100, memo: "Revenue" },
        ],
      });
      spies.journalCreate.mockResolvedValue({ id: 2, journalNumber: "REV-1" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });
      spies.journalUpdate.mockResolvedValue({});

      const result = await service.reverseJournal(1, "REV-1", 42);

      expect(result).toEqual({ id: 2, journalNumber: "REV-1" });
      // Reversal swaps debit/credit
      expect(spies.journalEntryCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ accountId: 1, debit: 0, credit: 100 }),
          expect.objectContaining({ accountId: 2, debit: 100, credit: 0 }),
        ],
      });
      // Original marked reversed
      expect(spies.journalUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "REVERSED" },
      });
    });
  });
});
