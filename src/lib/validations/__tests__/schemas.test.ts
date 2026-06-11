import { describe, it, expect } from "vitest";
import { customerSchema, vendorSchema, itemSchema } from "@/lib/validations/schemas";

describe("validations/schemas", () => {
  describe("customerSchema", () => {
    it("accepts a minimal valid customer", () => {
      const result = customerSchema.safeParse({ name: "PT ABC" });
      expect(result.success).toBe(true);
    });

    it("rejects empty name", () => {
      const result = customerSchema.safeParse({ name: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("Nama wajib diisi");
      }
    });

    it("rejects invalid email", () => {
      const result = customerSchema.safeParse({ name: "PT ABC", email: "not-an-email" });
      expect(result.success).toBe(false);
    });

    it("treats empty-string email as undefined", () => {
      const result = customerSchema.safeParse({ name: "PT ABC", email: "" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.email).toBeUndefined();
    });

    it("accepts valid gender enum and rejects invalid", () => {
      expect(customerSchema.safeParse({ name: "X", gender: "male" }).success).toBe(true);
      expect(customerSchema.safeParse({ name: "X", gender: "other" }).success).toBe(false);
    });

    it("rejects negative credit limit", () => {
      const result = customerSchema.safeParse({ name: "X", creditLimit: -100 });
      expect(result.success).toBe(false);
    });
  });

  describe("vendorSchema", () => {
    it("accepts a minimal valid vendor", () => {
      expect(vendorSchema.safeParse({ name: "Supplier A" }).success).toBe(true);
    });

    it("rejects empty name", () => {
      expect(vendorSchema.safeParse({ name: "" }).success).toBe(false);
    });

    it("rejects invalid email but accepts empty", () => {
      expect(vendorSchema.safeParse({ name: "X", email: "bad" }).success).toBe(false);
      expect(vendorSchema.safeParse({ name: "X", email: "" }).success).toBe(true);
    });
  });

  describe("itemSchema", () => {
    it("accepts a valid item with required cost/price", () => {
      const result = itemSchema.safeParse({ name: "Oli Mesin", cost: 50000, price: 75000 });
      expect(result.success).toBe(true);
    });

    it("defaults unitOfMeasure to PCS", () => {
      const result = itemSchema.safeParse({ name: "Item", cost: 0, price: 0 });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.unitOfMeasure).toBe("PCS");
    });

    it("rejects missing cost", () => {
      const result = itemSchema.safeParse({ name: "Item", price: 100 });
      expect(result.success).toBe(false);
    });

    it("rejects negative cost", () => {
      const result = itemSchema.safeParse({ name: "Item", cost: -1, price: 100 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.message.includes("Harga beli minimal 0"))).toBe(true);
      }
    });

    it("rejects negative price", () => {
      const result = itemSchema.safeParse({ name: "Item", cost: 100, price: -5 });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = itemSchema.safeParse({ name: "", cost: 0, price: 0 });
      expect(result.success).toBe(false);
    });

    it("accepts optional tracking flags", () => {
      const result = itemSchema.safeParse({
        name: "Tracked", cost: 0, price: 0, trackBatch: true, trackSerial: true, isProduct: false,
      });
      expect(result.success).toBe(true);
    });
  });
});
