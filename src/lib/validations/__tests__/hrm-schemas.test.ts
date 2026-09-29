import { describe, it, expect } from "vitest";
import {
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  payrollSchema,
} from "@/lib/validations/hrm.schemas";

describe("validations/hrm.schemas", () => {
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
