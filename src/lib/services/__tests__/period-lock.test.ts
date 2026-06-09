import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
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
});
