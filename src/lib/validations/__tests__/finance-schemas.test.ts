import { describe, it, expect } from "vitest";
import {
  bankStatementSchema,
  journalSchema,
  expenseSchema,
  pettyCashSchema,
  bankReconciliationSchema,
  budgetSchema,
  costCenterSchema,
} from "@/lib/validations/finance.schemas";

describe("validations/finance.schemas", () => {
  describe("bankStatementSchema", () => {
    it("accepts a valid statement and transforms date", () => {
      const r = bankStatementSchema.safeParse({ accountId: 1, date: "2026-06-09" });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.date).toBeInstanceOf(Date);
        expect(r.data.openingBalance).toBe(0);
      }
    });
    it("rejects non-positive accountId", () => {
      expect(bankStatementSchema.safeParse({ accountId: 0, date: "2026-06-09" }).success).toBe(false);
    });
    it("rejects empty date", () => {
      expect(bankStatementSchema.safeParse({ accountId: 1, date: "" }).success).toBe(false);
    });
  });

  describe("journalSchema", () => {
    it("accepts a valid journal with entries string", () => {
      const r = journalSchema.safeParse({ transactionDate: "2026-06-09", entries: "[]" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.type).toBe("GENERAL");
    });
    it("rejects empty entries", () => {
      expect(journalSchema.safeParse({ transactionDate: "2026-06-09", entries: "" }).success).toBe(false);
    });
  });

  describe("expenseSchema", () => {
    it("accepts a valid expense", () => {
      expect(expenseSchema.safeParse({ accountId: 1, amount: 50000, date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects zero amount", () => {
      expect(expenseSchema.safeParse({ accountId: 1, amount: 0, date: "2026-06-09" }).success).toBe(false);
    });
    it("rejects negative amount", () => {
      expect(expenseSchema.safeParse({ accountId: 1, amount: -100, date: "2026-06-09" }).success).toBe(false);
    });
    it("rejects non-positive accountId", () => {
      expect(expenseSchema.safeParse({ accountId: 0, amount: 100, date: "2026-06-09" }).success).toBe(false);
    });
    it("accepts Nama Project + Vendor (pola jurnal operasional)", () => {
      const r = expenseSchema.safeParse({
        accountId: 1, amount: 50000, date: "2026-06-09",
        projectId: 7, categoryId: 3, vendorId: 12,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.projectId).toBe(7);
        expect(r.data.categoryId).toBe(3);
        expect(r.data.vendorId).toBe(12);
      }
    });
    it("coerces string project/vendor ids (FormData)", () => {
      const r = expenseSchema.safeParse({
        accountId: "1", amount: "50000", date: "2026-06-09",
        projectId: "7", vendorId: "12", categoryId: "3",
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.projectId).toBe(7);
        expect(r.data.vendorId).toBe(12);
        expect(r.data.categoryId).toBe(3);
      }
    });
  });

  describe("pettyCashSchema", () => {
    it("accepts valid IN entry", () => {
      expect(pettyCashSchema.safeParse({ type: "IN", amount: 1000, date: "2026-06-09" }).success).toBe(true);
    });
    it("accepts valid OUT entry", () => {
      expect(pettyCashSchema.safeParse({ type: "OUT", amount: 1000, date: "2026-06-09" }).success).toBe(true);
    });
    it("rejects invalid type", () => {
      expect(pettyCashSchema.safeParse({ type: "MAYBE", amount: 1000, date: "2026-06-09" }).success).toBe(false);
    });
    it("rejects zero amount", () => {
      expect(pettyCashSchema.safeParse({ type: "IN", amount: 0, date: "2026-06-09" }).success).toBe(false);
    });
    it("accepts Nama Project + Vendor + Kategori (pola jurnal operasional)", () => {
      const r = pettyCashSchema.safeParse({
        type: "OUT", amount: 20000, date: "2026-06-09",
        projectId: 5, vendorId: 9, categoryId: 2,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.projectId).toBe(5);
        expect(r.data.vendorId).toBe(9);
        expect(r.data.categoryId).toBe(2);
      }
    });
    it("coerces string project/vendor/category ids (FormData)", () => {
      const r = pettyCashSchema.safeParse({
        type: "OUT", amount: "20000", date: "2026-06-09",
        projectId: "5", vendorId: "9", categoryId: "2",
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.projectId).toBe(5);
        expect(r.data.vendorId).toBe(9);
        expect(r.data.categoryId).toBe(2);
      }
    });
  });

  describe("bankReconciliationSchema", () => {
    it("accepts valid reconciliation", () => {
      const r = bankReconciliationSchema.safeParse({
        accountId: 1, statementDate: "2026-06-09", statementBalance: 1000000,
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.bookBalance).toBe(0);
    });
    it("rejects missing statementBalance", () => {
      expect(bankReconciliationSchema.safeParse({ accountId: 1, statementDate: "2026-06-09" }).success).toBe(false);
    });
  });

  describe("budgetSchema", () => {
    it("accepts a valid budget", () => {
      expect(budgetSchema.safeParse({
        name: "Budget Q3", accountId: 1, amount: 5000000, startDate: "2026-07-01", endDate: "2026-09-30",
      }).success).toBe(true);
    });
    it("rejects empty name", () => {
      expect(budgetSchema.safeParse({
        name: "", accountId: 1, amount: 100, startDate: "2026-07-01", endDate: "2026-09-30",
      }).success).toBe(false);
    });
    it("rejects zero amount", () => {
      expect(budgetSchema.safeParse({
        name: "B", accountId: 1, amount: 0, startDate: "2026-07-01", endDate: "2026-09-30",
      }).success).toBe(false);
    });
    it("rejects endDate before startDate", () => {
      expect(budgetSchema.safeParse({
        name: "B", accountId: 1, amount: 100, startDate: "2026-09-30", endDate: "2026-07-01",
      }).success).toBe(false);
    });
    it("accepts endDate equal to startDate", () => {
      expect(budgetSchema.safeParse({
        name: "B", accountId: 1, amount: 100, startDate: "2026-07-01", endDate: "2026-07-01",
      }).success).toBe(true);
    });
  });

  describe("costCenterSchema", () => {
    it("accepts a valid cost center", () => {
      const r = costCenterSchema.safeParse({ code: "CC-01", name: "Operasional" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.isActive).toBe(false);
    });
    it("rejects empty code", () => {
      expect(costCenterSchema.safeParse({ code: "", name: "X" }).success).toBe(false);
    });
    it("rejects empty name", () => {
      expect(costCenterSchema.safeParse({ code: "CC-01", name: "" }).success).toBe(false);
    });
  });
});
