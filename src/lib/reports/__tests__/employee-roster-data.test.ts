import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Loader roster = konsumen baca pertama EmployeeRoster (UI belum ada).
 * Kunci: findMany dibatasi employee/date range + status opsional, hasil
 * dipetakan datar (nama karyawan dari relasi), urutan tanggal stabil.
 */

const mocks = vi.hoisted(() => ({
  employeeRosterFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employeeRoster: { findMany: mocks.employeeRosterFindMany },
  },
}));

import { loadEmployeeRoster } from "@/lib/reports/employee-roster-data";

const FROM = new Date("2026-10-01T00:00:00.000Z");
const TO = new Date("2026-10-31T00:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.employeeRosterFindMany.mockResolvedValue([
    {
      id: 2,
      employeeId: 7,
      date: new Date("2026-10-05T00:00:00.000Z"),
      type: "shift_pagi",
      status: "approved",
      notes: null,
      approvedBy: 1,
      approvedAt: new Date("2026-10-04T00:00:00.000Z"),
      employee: { name: "Bambang" },
    },
  ]);
});

describe("loadEmployeeRoster", () => {
  it("findMany by date range saja bila employee/status kosong", async () => {
    const rows = await loadEmployeeRoster({ dateFrom: FROM, dateTo: TO });
    const args = mocks.employeeRosterFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ date: { gte: FROM, lte: TO } });
    expect(args.orderBy).toEqual([{ date: "asc" }, { employeeId: "asc" }, { id: "asc" }]);
    expect(rows).toEqual([
      {
        id: 2,
        employeeId: 7,
        employeeName: "Bambang",
        date: new Date("2026-10-05T00:00:00.000Z"),
        type: "shift_pagi",
        status: "approved",
        notes: null,
        approvedBy: 1,
        approvedAt: new Date("2026-10-04T00:00:00.000Z"),
      },
    ]);
  });

  it("employeeId + status menyempitkan where", async () => {
    await loadEmployeeRoster({ employeeId: 7, status: "draft", dateFrom: FROM, dateTo: TO });
    const args = mocks.employeeRosterFindMany.mock.calls[0][0];
    expect(args.where).toEqual({
      date: { gte: FROM, lte: TO },
      employeeId: 7,
      status: "draft",
    });
  });
});
