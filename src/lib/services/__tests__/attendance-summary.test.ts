import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  employeeFindUnique: vi.fn(),
  workScheduleFindMany: vi.fn(),
  holidayFindMany: vi.fn(),
  deptHolidayFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  leaveFindMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: { findUnique: mocks.employeeFindUnique },
    workSchedule: { findMany: mocks.workScheduleFindMany },
    holiday: { findMany: mocks.holidayFindMany },
    departmentHoliday: { findMany: mocks.deptHolidayFindMany },
    attendance: { findMany: mocks.attendanceFindMany },
    leaveRequest: { findMany: mocks.leaveFindMany },
  },
}));

import { calculateAttendanceSummary } from "@/lib/services/attendance-summary.service";

// Use a fully-past period (Jan 2026) so "evaluate up to today" never truncates.
const START = new Date("2026-01-01");
const END = new Date("2026-01-07"); // Thu Jan 1 .. Wed Jan 7, 2026

describe("attendance-summary.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.holidayFindMany.mockResolvedValue([]);
    mocks.deptHolidayFindMany.mockResolvedValue([]);
    mocks.attendanceFindMany.mockResolvedValue([]);
    mocks.leaveFindMany.mockResolvedValue([]);
  });

  it("returns empty summary when employee not found", async () => {
    mocks.employeeFindUnique.mockResolvedValue(null);

    const result = await calculateAttendanceSummary(1, START, END);

    expect(result).toEqual({
      workingDays: 0, presentDays: 0, leaveDays: 0,
      holidayDays: 0, absentDays: 0, dailyRate: 0, absentDeduction: 0,
    });
    expect(mocks.workScheduleFindMany).not.toHaveBeenCalled();
  });

  it("returns empty summary when no work schedule configured", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 3000000 });
    mocks.workScheduleFindMany.mockResolvedValue([]);

    const result = await calculateAttendanceSummary(1, START, END);

    expect(result.workingDays).toBe(0);
    expect(result.absentDeduction).toBe(0);
  });

  it("counts present days when employee checked in", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 0 });
    // Mon-Fri working days (1..5), global schedule (no employees, no departments)
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [], departments: [] },
    ]);
    // Jan 1 2026 = Thu, Jan 2 = Fri, Jan 5 = Mon, Jan 6 = Tue, Jan 7 = Wed (Jan 3-4 weekend)
    mocks.attendanceFindMany.mockResolvedValue([
      { date: new Date("2026-01-01") },
      { date: new Date("2026-01-02") },
    ]);

    const result = await calculateAttendanceSummary(1, START, END);

    // Working weekdays in range: Jan 1(Thu),2(Fri),5(Mon),6(Tue),7(Wed) = 5
    expect(result.workingDays).toBe(5);
    expect(result.presentDays).toBe(2);
    expect(result.absentDays).toBe(3);
  });

  it("counts holidays as days off (not absent)", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 0 });
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [], departments: [] },
    ]);
    mocks.holidayFindMany.mockResolvedValue([{ date: new Date("2026-01-01") }]);

    const result = await calculateAttendanceSummary(1, START, END);

    expect(result.holidayDays).toBe(1);
    // 5 working weekdays minus 1 holiday = 4 working days, all absent (no check-in)
    expect(result.workingDays).toBe(4);
    expect(result.absentDays).toBe(4);
  });

  it("counts approved leave days", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 0 });
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [], departments: [] },
    ]);
    mocks.leaveFindMany.mockResolvedValue([
      { startDate: new Date("2026-01-01"), endDate: new Date("2026-01-02") },
    ]);

    const result = await calculateAttendanceSummary(1, START, END);

    expect(result.leaveDays).toBe(2);
    expect(result.absentDays).toBe(3);
  });

  it("computes dailyRate and absentDeduction from baseSalary", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 5000000 });
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [], departments: [] },
    ]);
    // No attendance, no leave → all 5 working days are absent
    const result = await calculateAttendanceSummary(1, START, END);

    expect(result.workingDays).toBe(5);
    expect(result.dailyRate).toBe(5000000 / 5); // 1,000,000
    expect(result.absentDeduction).toBe(Math.round(5 * (5000000 / 5))); // 5,000,000
  });

  it("matches employee-specific schedule assignment", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 7, departmentId: 2, baseSalary: 0 });
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3,4,5", employees: [{ id: 7 }], departments: [] },
      { workDays: "6", employees: [{ id: 99 }], departments: [] }, // not this employee
    ]);

    const result = await calculateAttendanceSummary(7, START, END);

    expect(result.workingDays).toBe(5);
  });

  it("treats Sunday as a working day when configured in workDays", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 1, departmentId: null, baseSalary: 7000000 });
    // All 7 days (0=Sun..6=Sat) are working days, e.g. a retail/hospitality schedule.
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "0,1,2,3,4,5,6", employees: [], departments: [] },
    ]);

    const result = await calculateAttendanceSummary(1, START, END);

    // Jan 1(Thu)..Jan 7(Wed) is 7 calendar days. Jan 4 is Sunday.
    // With Sunday configured as a working day, it MUST be counted.
    // The bug: `d.getDay() === 0` hardcodes Sunday as holiday, so it
    // gets skipped even when explicitly in workDays.
    expect(result.workingDays).toBe(7);
    expect(result.absentDays).toBe(7);
  });

  it("matches department-scoped schedule", async () => {
    mocks.employeeFindUnique.mockResolvedValue({ id: 7, departmentId: 3, baseSalary: 0 });
    mocks.workScheduleFindMany.mockResolvedValue([
      { workDays: "1,2,3", employees: [], departments: [{ id: 3 }] },
    ]);

    const result = await calculateAttendanceSummary(7, START, END);

    // Working weekdays 1,2,3 (Mon,Tue,Wed): Jan 5(Mon),6(Tue),7(Wed) = 3
    expect(result.workingDays).toBe(3);
  });
});
