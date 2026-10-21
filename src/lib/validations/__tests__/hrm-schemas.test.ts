import { describe, it, expect } from "vitest";
import {
  leaveRequestSchema,
  overtimeRequestSchema,
  employeeLoanSchema,
  timesheetSchema,
  payrollSchema,
  holidaySchema,
  statutoryRuleSchema,
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
    it("accepts work-order context without projectId (F-2026-10-21-019)", () => {
      expect(timesheetSchema.safeParse({
        employeeId: 1, workOrderId: 7, date: "2026-06-09", hours: 8,
      }).success).toBe(true);
    });
    it("rejects hours above the 24h per-row cap (F-2026-10-21-019)", () => {
      expect(timesheetSchema.safeParse({
        employeeId: 1, projectId: 2, date: "2026-06-09", hours: 25,
      }).success).toBe(false);
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

  describe("fictitious calendar dates rejected (no silent JS rollover)", () => {
    it("leaveRequestSchema rejects 2026-02-30 start/end", () => {
      expect(leaveRequestSchema.safeParse({
        employeeId: 1, type: "Cuti Tahunan", startDate: "2026-02-30", endDate: "2026-03-02",
      }).success).toBe(false);
      expect(leaveRequestSchema.safeParse({
        employeeId: 1, type: "Cuti Tahunan", startDate: "2026-06-09", endDate: "2026-02-30",
      }).success).toBe(false);
    });
    it("overtimeRequestSchema rejects 2026-02-30", () => {
      expect(overtimeRequestSchema.safeParse({ employeeId: 1, date: "2026-02-30", hours: 2 }).success).toBe(false);
    });
    it("employeeLoanSchema rejects 2026-02-30 loanDate", () => {
      expect(employeeLoanSchema.safeParse({
        employeeId: 1, loanDate: "2026-02-30", totalAmount: 1000000, monthlyInstallment: 100000,
      }).success).toBe(false);
    });
    it("timesheetSchema rejects 2026-13-01", () => {
      expect(timesheetSchema.safeParse({
        employeeId: 1, projectId: 2, date: "2026-13-01", hours: 8,
      }).success).toBe(false);
    });
    it("payrollSchema rejects 2026-02-30 startDate", () => {
      expect(payrollSchema.safeParse({
        period: "Feb 2026", startDate: "2026-02-30", endDate: "2026-03-01",
      }).success).toBe(false);
    });
    it("holidaySchema rejects non-date text", () => {
      expect(holidaySchema.safeParse({ name: "Libur", date: "bukan-tanggal" }).success).toBe(false);
    });
    it("statutoryRuleSchema rejects 2026-02-30 effectiveFrom and effectiveTo", () => {
      expect(statutoryRuleSchema.safeParse({ key: "ptkp_tk0", value: 54000000, effectiveFrom: "2026-02-30" }).success).toBe(false);
      expect(statutoryRuleSchema.safeParse({ key: "ptkp_tk0", value: 54000000, effectiveFrom: "2026-01-01", effectiveTo: "2026-02-30" }).success).toBe(false);
    });
    it("attendance-free valid dates still pass", () => {
      expect(leaveRequestSchema.safeParse({
        employeeId: 1, type: "Cuti Tahunan", startDate: "2026-02-28", endDate: "2026-03-01",
      }).success).toBe(true);
    });
  });
});

describe("hrm dateOnly kalender", () => {
  it("rejects fictional dates in leave/overtime/loan/payroll/holiday/statutory", () => {
    expect(leaveRequestSchema.safeParse({ employeeId: 1, type: "Cuti", startDate: "2026-02-30", endDate: "2026-03-01" }).success).toBe(false);
    expect(overtimeRequestSchema.safeParse({ employeeId: 1, date: "2026-02-30", hours: 2 }).success).toBe(false);
    expect(employeeLoanSchema.safeParse({ employeeId: 1, loanDate: "2026-02-30", totalAmount: 1000, monthlyInstallment: 100 }).success).toBe(false);
    expect(payrollSchema.safeParse({ period: "Feb", startDate: "2026-02-30", endDate: "2026-02-28" }).success).toBe(false);
    expect(timesheetSchema.safeParse({ employeeId: 1, projectId: 2, date: "2026-13-01", hours: 8 }).success).toBe(false);
    expect(holidaySchema.safeParse({ name: "Libur", date: "bukan-tanggal" }).success).toBe(false);
    expect(statutoryRuleSchema.safeParse({ key: "ptkp_tk0", value: 1, effectiveFrom: "2026-02-30" }).success).toBe(false);
    expect(statutoryRuleSchema.safeParse({ key: "ptkp_tk0", value: 1, effectiveFrom: "2026-01-01", effectiveTo: "2026-02-30" }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ employeeId: 1, type: "Cuti", startDate: "2026-02-28", endDate: "2026-03-01" }).success).toBe(true);
  });
});
