import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.findFirst },
  },
}));

import { assertPeriodOpen } from "@/lib/services/period-lock.service";

describe("period-lock.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not throw when no period lock is configured", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: null });

    await expect(assertPeriodOpen(new Date("2026-06-09"))).resolves.toBeUndefined();
  });

  it("does not throw when settings is null", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(assertPeriodOpen(new Date("2026-06-09"))).resolves.toBeUndefined();
  });

  it("throws when transaction date is before the lock date", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: new Date("2026-05-31") });

    await expect(assertPeriodOpen(new Date("2026-05-15"))).rejects.toThrow(
      "Periode akuntansi sudah ditutup"
    );
  });

  it("throws when transaction date equals the lock date (same day)", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: new Date("2026-05-31") });

    await expect(assertPeriodOpen(new Date("2026-05-31"))).rejects.toThrow(
      "Periode akuntansi sudah ditutup"
    );
  });

  it("does not throw when transaction date is after the lock date", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: new Date("2026-05-31") });

    await expect(assertPeriodOpen(new Date("2026-06-01"))).resolves.toBeUndefined();
  });

  it("allows a transaction the day after the lock (boundary)", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: new Date("2026-05-31T00:00:00") });

    await expect(assertPeriodOpen(new Date("2026-06-01T00:00:00"))).resolves.toBeUndefined();
  });

  it("blocks a transaction on the lock day regardless of time of day", async () => {
    mocks.findFirst.mockResolvedValue({ periodLockDate: new Date("2026-05-31") });

    await expect(assertPeriodOpen(new Date("2026-05-31T23:30:00"))).rejects.toThrow(
      "tidak dapat diposting/diubah"
    );
  });

  describe("R-09 cabang tx (locking read)", () => {
    function makeTx(order: string[]) {
      return {
        $queryRaw: (strings: unknown) => {
          order.push("lock-setting");
          const sql = (strings as string[]).join(" ");
          return mocks.queryRaw(sql);
        },
        systemSetting: {
          findFirst: vi.fn(() => {
            order.push("findFirst");
            return mocks.findFirst();
          }),
        },
      } as never;
    }

    it("mengunci baris setting (FOR UPDATE) sebelum membaca tanggal kunci; tanpa findFirst", async () => {
      const order: string[] = [];
      mocks.queryRaw.mockImplementation(async () => {
        order.push("read-lock-date");
        return [{ id: 1, period_lock_date: new Date("2026-05-31") }];
      });

      await expect(
        assertPeriodOpen(new Date("2026-05-15"), makeTx(order)),
      ).rejects.toThrow("Periode akuntansi sudah ditutup");

      // Lock dulu, baru nilai tanggal kunci dibaca dari baris yang sama.
      expect(order).toEqual(["lock-setting", "read-lock-date"]);
      expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
      const sql = String(mocks.queryRaw.mock.calls[0][0]);
      expect(sql).toContain("FROM system_settings");
      expect(sql).toContain("period_lock_date");
      expect(sql).toContain("ORDER BY id");
      expect(sql).toContain("LIMIT 1");
      expect(sql).toContain("FOR UPDATE");
      expect(mocks.findFirst).not.toHaveBeenCalled();
    });

    it("lolos bila tanggal sesudah kunci (baris terkunci dibaca sekali)", async () => {
      const order: string[] = [];
      mocks.queryRaw.mockResolvedValue([{ id: 1, period_lock_date: new Date("2026-05-31") }]);

      await expect(
        assertPeriodOpen(new Date("2026-06-01"), makeTx(order)),
      ).resolves.toBeUndefined();
      expect(order).toEqual(["lock-setting"]);
    });

    it("lolos bila period_lock_date null / baris tidak ada", async () => {
      const order: string[] = [];
      mocks.queryRaw.mockResolvedValue([{ id: 1, period_lock_date: null }]);
      await expect(
        assertPeriodOpen(new Date("2026-05-15"), makeTx(order)),
      ).resolves.toBeUndefined();

      mocks.queryRaw.mockResolvedValue([]);
      await expect(
        assertPeriodOpen(new Date("2026-05-15"), makeTx(order)),
      ).resolves.toBeUndefined();
    });

    it("tanpa tx: perilaku lama (findFirst, tanpa locking read)", async () => {
      mocks.findFirst.mockResolvedValue({ periodLockDate: null });

      await expect(assertPeriodOpen(new Date("2026-06-09"))).resolves.toBeUndefined();
      expect(mocks.findFirst).toHaveBeenCalledTimes(1);
      expect(mocks.queryRaw).not.toHaveBeenCalled();
    });
  });
});
