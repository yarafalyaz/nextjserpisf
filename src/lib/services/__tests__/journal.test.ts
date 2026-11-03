import { describe, it, expect, vi } from "vitest";
import { JournalService } from "@/lib/services/journal.service";

vi.mock("@/lib/services/period-lock.service", () => ({
  assertPeriodOpen: vi.fn().mockResolvedValue(undefined),
}));

// Build a mock prisma-like client whose $transaction runs the callback with a mock tx.
function buildService(txOverrides: Record<string, unknown> = {}) {
  const spies = {
    accountFindMany: vi.fn(),
    journalCreate: vi.fn(),
    journalEntryCreateMany: vi.fn(),
    journalFindUniqueOrThrow: vi.fn(),
    journalFindFirst: vi.fn(),
    journalUpdate: vi.fn(),
    queryRaw: vi.fn().mockResolvedValue([{ id: 1, period_lock_date: null }]),
    executeRaw: vi.fn().mockResolvedValue(1),
  };
  spies.journalFindFirst.mockResolvedValue(null);

  const tx = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    account: { findMany: spies.accountFindMany },
    costCenter: { findMany: vi.fn().mockResolvedValue([]) },
    profitCenter: { findMany: vi.fn().mockResolvedValue([]) },
    journal: {
      create: spies.journalCreate,
      findUniqueOrThrow: spies.journalFindUniqueOrThrow,
      findFirst: spies.journalFindFirst,
      update: spies.journalUpdate,
    },
    journalEntry: { createMany: spies.journalEntryCreateMany },
    ...txOverrides,
  };

  const prismaLike = {
    $transaction: (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as never;

  return { service: new JournalService(prismaLike), spies, tx };
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
      ).rejects.toThrow("minimal 1 entri");
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
      ).rejects.toThrow("harus memiliki nilai Debit atau Kredit");
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
      ).rejects.toThrow("Akun tidak ditemukan: 2");
    });

    // Regresi putaran 45: createJournal lahir POSTED hanya dengan cek
    // eksistensi — akun nonaktif/terhapus/induk lolos, jadi jalur stok
    // (mapping settings mentah) tetap memposting ke akun mati.
    it("regresi putaran 45: menolak akun nonaktif", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: false, deletedAt: null, _count: { children: 0 } },
      ]);
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "stock",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).rejects.toThrow(/tidak aktif\/terhapus.*2/);
      expect(spies.journalCreate).not.toHaveBeenCalled();
    });

    it("regresi putaran 45: menolak akun terhapus (soft-delete)", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: new Date(), _count: { children: 0 } },
      ]);
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "stock",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).rejects.toThrow(/tidak aktif\/terhapus.*2/);
      expect(spies.journalCreate).not.toHaveBeenCalled();
    });

    it("regresi putaran 45: menolak akun induk", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 2 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "stock",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).rejects.toThrow(/Akun induk.*1/);
      expect(spies.journalCreate).not.toHaveBeenCalled();
    });

    it("creates a balanced journal with entries", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
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

    it("persists costCenterId on entries (dimension must survive the tx path)", async () => {
      // Regression: the transactional createMany dropped entry.costCenterId, so the
      // Material-Issue / stock journals landed with cost_center_id = NULL and every
      // cost-center report (pusat-laba, anggaran-vs-realisasi) silently lost the
      // realisasi into the "no cost center" bucket.
      const { service, spies } = buildService({
        costCenter: { findMany: vi.fn().mockResolvedValue([{ id: 42 }]) },
      });
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
      spies.journalCreate.mockResolvedValue({ id: 7, journalNumber: "JRN-CC" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });

      await service.createJournal({
        journalNumber: "JRN-CC",
        transactionDate: new Date("2026-06-09"),
        type: "MI",
        entries: [
          { accountId: 1, debit: 100, credit: 0, costCenterId: 42 },
          { accountId: 2, debit: 0, credit: 100 },
        ],
      });

      expect(spies.journalEntryCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ accountId: 1, costCenterId: 42 }),
          expect.objectContaining({ accountId: 2, costCenterId: null }),
        ],
      });
    });

    // Putaran 81: jurnal lahir POSTED — titik pengakuan wajib mengunci baris
    // akun + pusat sebelum menilai (penulis lawan: updateAccount induk /
    // deleteCostCenter / deleteProfitCenter berkunci baris sama).
    it("putaran 81: mengunci baris akun urut id sebelum menilai akun", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
      spies.journalCreate.mockResolvedValue({ id: 1, journalNumber: "JRN-1" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });

      await service.createJournal({
        journalNumber: "JRN-1",
        transactionDate: new Date(),
        type: "manual",
        entries: [
          { accountId: 2, debit: 100, credit: 0 },
          { accountId: 1, debit: 0, credit: 100 },
        ],
      });

      const sqls = spies.executeRaw.mock.calls.map((c) => ((c as unknown as [string[]])[0] ?? []).join("?"));
      const accountLockIndex = sqls.findIndex((s) => /from\s+accounts/i.test(s) && /for update/i.test(s));
      expect(accountLockIndex).toBeGreaterThanOrEqual(0);
      // Prisma.join membungkus daftar id sebagai satu nilai _Sql.
      const joinArg = spies.executeRaw.mock.calls[accountLockIndex][1] as unknown as { values: unknown[] };
      expect(joinArg.values).toEqual([1, 2]);
      expect(spies.executeRaw.mock.invocationCallOrder[accountLockIndex]).toBeLessThan(
        spies.accountFindMany.mock.invocationCallOrder[0],
      );
    });

    it("putaran 81: menolak pusat biaya fiktif (jurnal lahir POSTED)", async () => {
      const ccFindMany = vi.fn().mockResolvedValue([]);
      const { service, spies } = buildService({ costCenter: { findMany: ccFindMany } });
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);

      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "stock",
          entries: [
            { accountId: 1, debit: 100, credit: 0, costCenterId: 42 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        }),
      ).rejects.toThrow(/Pusat biaya tidak ditemukan.*42/);
      expect(spies.journalCreate).not.toHaveBeenCalled();
    });

    it("putaran 81: menolak pusat laba fiktif (jurnal lahir POSTED)", async () => {
      const pcFindMany = vi.fn().mockResolvedValue([]);
      const { service, spies } = buildService({ profitCenter: { findMany: pcFindMany } });
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);

      await expect(
        service.createJournal({
          journalNumber: "JRN-1",
          transactionDate: new Date(),
          type: "stock",
          entries: [
            { accountId: 1, debit: 100, credit: 0, profitCenterId: 9 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        }),
      ).rejects.toThrow(/Pusat laba tidak ditemukan.*9/);
      expect(spies.journalCreate).not.toHaveBeenCalled();
    });

    it("writes through an existing transaction without opening a nested transaction", async () => {
      const { spies, tx } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
      spies.journalCreate.mockResolvedValue({ id: 33, journalNumber: "JRN-TX" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });
      const service = new JournalService(tx as never);

      await expect(service.createJournal({
        journalNumber: "JRN-TX",
        transactionDate: new Date("2026-06-09"),
        type: "stock",
        entries: [
          { accountId: 1, debit: 50, credit: 0 },
          { accountId: 2, debit: 0, credit: 50 },
        ],
      })).resolves.toEqual({ id: 33, journalNumber: "JRN-TX" });

      expect(spies.accountFindMany).toHaveBeenCalledOnce();
      expect(spies.journalCreate).toHaveBeenCalledOnce();
    });

    it("accepts tiny floating-point imbalance within epsilon", async () => {
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);
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

    it("R1: create ditolak saat periode terkunci (assertPeriodOpen melempar)", async () => {
      const { assertPeriodOpen } = await import("@/lib/services/period-lock.service");
      vi.mocked(assertPeriodOpen).mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"));
      const { service, spies } = buildService();
      spies.accountFindMany.mockResolvedValue([
        { id: 1, isActive: true, deletedAt: null, _count: { children: 0 } },
        { id: 2, isActive: true, deletedAt: null, _count: { children: 0 } },
      ]);

      await expect(
        service.createJournal({
          journalNumber: "JRN-LOCK",
          transactionDate: new Date("2025-01-05"),
          type: "manual",
          entries: [
            { accountId: 1, debit: 100, credit: 0 },
            { accountId: 2, debit: 0, credit: 100 },
          ],
        })
      ).rejects.toThrow("sudah ditutup");
      expect(spies.journalCreate).not.toHaveBeenCalled();
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

    it("E121-6: jalur generik menolak jurnal penutup tahun, nol reversal ditulis", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1,
        journalNumber: "JRN-1",
        status: "POSTED",
        referenceType: "YearEndClosing",
        referenceId: 2025,
        type: "GENERAL",
        totalDebit: 100,
        totalCredit: 100,
        entries: [{ accountId: 1, debit: 100, credit: 0, memo: "Penutup", costCenterId: null }],
      });

      await expect(service.reverseJournal(1, "REV-1")).rejects.toThrow(
        "hanya boleh di-reversal lewat reversal penutup tahun"
      );
      expect(spies.journalCreate).not.toHaveBeenCalled();
      expect(spies.journalUpdate).not.toHaveBeenCalled();
    });

    it("TASK-025: menolak reversal atas jurnal reversal (referenceType Journal), nol reversal ditulis", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 2,
        journalNumber: "JRN-RV-1",
        status: "POSTED",
        referenceType: "Journal",
        referenceId: 1,
        type: "GENERAL",
        totalDebit: 100,
        totalCredit: 100,
        entries: [{ accountId: 1, debit: 0, credit: 100, memo: "Reversal", costCenterId: null }],
      });

      await expect(service.reverseJournal(2, "REV-2")).rejects.toThrow(
        "Jurnal reversal tidak boleh di-reverse lagi"
      );
      expect(spies.journalCreate).not.toHaveBeenCalled();
      expect(spies.journalUpdate).not.toHaveBeenCalled();
    });

    it("rejects DRAFT journal (only POSTED can be reversed, consistent with finance.actions)", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1,
        journalNumber: "JRN-1",
        status: "DRAFT",
        type: "sales",
        totalDebit: 100,
        totalCredit: 100,
        entries: [
          { accountId: 1, debit: 100, credit: 0, memo: "AR" },
          { accountId: 2, debit: 0, credit: 100, memo: "Revenue" },
        ],
      });
      spies.journalCreate.mockResolvedValue({ id: 2, journalNumber: "REV-1" });

      await expect(service.reverseJournal(1, "REV-1")).rejects.toThrow("tidak bisa dibalik (status: DRAFT)");
      expect(spies.journalCreate).not.toHaveBeenCalled();
      expect(spies.journalUpdate).not.toHaveBeenCalled();
    });

    it("rejects POSTED journal that already has a reversal (no silent double reversal)", async () => {
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
      spies.journalFindFirst.mockResolvedValue({ id: 99 });
      spies.journalCreate.mockResolvedValue({ id: 2, journalNumber: "REV-1" });

      await expect(service.reverseJournal(1, "REV-1")).rejects.toThrow("sudah di-reverse");
      expect(spies.journalCreate).not.toHaveBeenCalled();
      expect(spies.journalUpdate).not.toHaveBeenCalled();
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

    it("regresi putaran 50: reversal menyalin profitCenterId + costCenterId entri asal", async () => {
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1,
        journalNumber: "JRN-1",
        status: "POSTED",
        type: "sales",
        totalDebit: 100,
        totalCredit: 100,
        entries: [
          { accountId: 1, debit: 100, credit: 0, memo: "AR", costCenterId: 7, profitCenterId: 11 },
          { accountId: 2, debit: 0, credit: 100, memo: "Revenue", costCenterId: null, profitCenterId: 12 },
        ],
      });
      spies.journalCreate.mockResolvedValue({ id: 2, journalNumber: "REV-1" });
      spies.journalEntryCreateMany.mockResolvedValue({ count: 2 });
      spies.journalUpdate.mockResolvedValue({});

      await service.reverseJournal(1, "REV-1", 42);

      expect(spies.journalEntryCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ accountId: 1, profitCenterId: 11, costCenterId: 7 }),
          expect.objectContaining({ accountId: 2, profitCenterId: 12, costCenterId: null }),
        ],
      });
    });

    it("R1: reverse ditolak saat periode asli terkunci (assertPeriodOpen melempar)", async () => {
      const { assertPeriodOpen } = await import("@/lib/services/period-lock.service");
      vi.mocked(assertPeriodOpen).mockRejectedValueOnce(new Error("Periode akuntansi sudah ditutup"));
      const { service, spies } = buildService();
      spies.journalFindUniqueOrThrow.mockResolvedValue({
        id: 1,
        journalNumber: "JRN-1",
        status: "POSTED",
        transactionDate: new Date("2025-01-05"),
        type: "sales",
        totalDebit: 100,
        totalCredit: 100,
        entries: [
          { accountId: 1, debit: 100, credit: 0, memo: "AR" },
          { accountId: 2, debit: 0, credit: 100, memo: "Revenue" },
        ],
      });

      await expect(service.reverseJournal(1, "REV-1")).rejects.toThrow("sudah ditutup");
      expect(spies.journalCreate).not.toHaveBeenCalled();
      expect(spies.journalUpdate).not.toHaveBeenCalled();
    });
  });
});
