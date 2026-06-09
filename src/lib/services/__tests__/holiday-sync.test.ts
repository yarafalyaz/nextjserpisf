import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  holidayFindMany: vi.fn(),
  holidayCreateMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    holiday: { findMany: mocks.holidayFindMany, createMany: mocks.holidayCreateMany },
  },
}));

import { syncNationalHolidays } from "@/lib/services/holiday-sync.service";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

describe("holiday-sync.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.holidayFindMany.mockResolvedValue([]);
    mocks.holidayCreateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches and creates new holidays for the year", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({
        "2026-01-01": { summary: "Tahun Baru" },
        "2026-05-01": { summary: "Hari Buruh" },
        "2025-12-25": { summary: "Natal (ignored, prior year)" },
      })
    );

    const result = await syncNationalHolidays(2026);

    expect(result.year).toBe(2026);
    expect(result.fetched).toBe(2); // only 2026 entries
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mocks.holidayCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ name: "Tahun Baru" }),
        expect.objectContaining({ name: "Hari Buruh" }),
      ]),
    });
  });

  it("skips holidays that already exist (idempotent)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({
        "2026-01-01": { summary: "Tahun Baru" },
        "2026-05-01": { summary: "Hari Buruh" },
      })
    );
    mocks.holidayFindMany.mockResolvedValue([
      { date: new Date("2026-01-01T00:00:00.000Z"), name: "Tahun Baru" },
    ]);

    const result = await syncNationalHolidays(2026);

    expect(result.fetched).toBe(2);
    expect(result.created).toBe(1); // only Hari Buruh is new
    expect(result.skipped).toBe(1);
  });

  it("does not call createMany when all holidays already exist", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ "2026-01-01": { summary: "Tahun Baru" } })
    );
    mocks.holidayFindMany.mockResolvedValue([
      { date: new Date("2026-01-01T00:00:00.000Z"), name: "Tahun Baru" },
    ]);

    const result = await syncNationalHolidays(2026);

    expect(result.created).toBe(0);
    expect(mocks.holidayCreateMany).not.toHaveBeenCalled();
  });

  it("uses default name when summary is missing", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ "2026-03-10": {} }));

    const result = await syncNationalHolidays(2026);

    expect(result.created).toBe(1);
    expect(mocks.holidayCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ name: "Hari Libur Nasional" })],
    });
  });

  it("throws when fetch fails (non-ok response)", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({}, false, 503));

    await expect(syncNationalHolidays(2026)).rejects.toThrow(
      "Gagal mengambil data libur nasional"
    );
  });

  it("throws when fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(syncNationalHolidays(2026)).rejects.toThrow(
      "Gagal mengambil data libur nasional"
    );
  });

  it("returns zero counts when no entries match the year", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ "2025-01-01": { summary: "Prior Year" } })
    );

    const result = await syncNationalHolidays(2026);

    expect(result.fetched).toBe(0);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
