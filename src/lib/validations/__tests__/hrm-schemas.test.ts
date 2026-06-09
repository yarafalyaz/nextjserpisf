import { describe, it, expect } from "vitest";
import {
  attendanceSchema,
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  workScheduleSchema,
  holidaySchema,
  payrollSchema,
} from "@/lib/validations/hrm.schemas";

describe("validations/hrm.schemas", () => {
  describe("attendanceSchema", () => {
    it("accepts valid attendance with default status", () => {
      const r = attendanceSchema.safeParse({ employeeId: 1, date: "2026-06-09" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.status).toBe("present");
    });
    it("rejects non-positive employeeId", () => {
      expect(attendanceSchema.safeParse({ employeeId: 0, date: "2026-06-09" }).success).toBe(false);
    });
    it("rejects empty date", () => {
      expect(attendanceSchema.safeParse({ employeeId: 1, date: "" }).success).toBe(false);
    });
  });

  describe("leaveRequestSchema", () => {
    it("accepts valid leave request", () => {
      expect(leaveRequestSchema.safeParse({
        employeeId: 1, type: "Cuti Tahunan", startDate: "2026-06-09", endDate: "2026-06-11",
      }).success).toBe(true);
    });
    it("rejects empty type", () => {
      expect(leaveRequestSchema.safeParse({
        employeeId: 1, type: "", startDate: "2026-06-09", endDate: "2026-06-11",
      }).success).toBe(false);
    });
  });

  describe("overtimeRequestSchema", () => {
    it("accepts valid overtime", () => {
      expect(overtimeRequestSchema.safeParse({ employeeId: 1, date: "2026-06-09", hours: 2 }).success).toBe(true);
    });
    it("rejects hours below minimum (0)", () => {
      expect(overtimeRequestSchema.safeParse({ employeeId: 1, date: "2026-06-09", hours: 0 }).success).toBe(false);
    });
  });

  describe("employeeLoanSchema", () => {
    it("accepts valid loan", () => {
      expect(employeeLoanSchema.safeParse({
        employeeId: 1, loanDate: "2026-06-09", totalAmount: 1000000, monthlyInstallment: 100000,
      }).success).toBe(true);
    });
    it("rejects totalAmount below 1", () => {
      expect(employeeLoanSchema.safeParse({
        employeeId: 1, loanDate: "2026-06-09", totalAmount: 0, monthlyInstallment: 100000,
      }).success).toBe(false);
    });
  });

  describe("timesheetSchema", () => {
    it("accepts valid timesheet", () => {
      expect(timesheetSchema.safeParse({
        employeeId: 1, projectId: 2, date: "2026-06-09", hours: 8,
      }).success).toBe(true);
    });
    it("rejects missing projectId", () => {
      expect(timesheetSchema.safeParse({ employeeId: 1, date: "2026-06-09", hours: 8 }).success).toBe(false);
    });
  });

  describe("workScheduleSchema", () => {
    it("accepts valid schedule", () => {
      expect(workScheduleSchema.safeParse({
        name: "Shift Pagi", startTime: "08:00", endTime: "17:00",
      }).success).toBe(true);
    });
    it("rejects empty name", () => {
      expect(workScheduleSchema.safeParse({ name: "", startTime: "08:00", endTime: "17:00" }).success).toBe(false);
    });
    it("rejects empty startTime", () => {
      expect(workScheduleSchema.safeParse({ name: "X", startTime: "", endTime: "17:00" }).success).toBe(false);
    });
  });

  describe("holidaySchema", () => {
    it("accepts valid holiday", () => {
      expect(holidaySchema.safeParse({ name: "Idul Fitri", date: "2026-03-20" }).success).toBe(true);
    });
    it("rejects empty name", () => {
      expect(holidaySchema.safeParse({ name: "", date: "2026-03-20" }).success).toBe(false);
    });
  });

  describe("payrollSchema", () => {
    it("accepts valid payroll", () => {
      expect(payrollSchema.safeParse({
        period: "Juni 2026", startDate: "2026-06-01", endDate: "2026-06-30",
      }).success).toBe(true);
    });
    it("rejects empty period", () => {
      expect(payrollSchema.safeParse({
        period: "", startDate: "2026-06-01", endDate: "2026-06-30",
      }).success).toBe(false);
    });
  });
});
