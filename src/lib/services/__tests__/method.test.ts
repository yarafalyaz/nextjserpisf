import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyPayment: vi.fn(),
  findManyShipping: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    paymentMethod: { findMany: mocks.findManyPayment },
    shippingMethod: { findMany: mocks.findManyShipping },
  },
}));

// Bypass unstable_cache wrapper so the prisma mocks above still receive the call.
// (unstable_cache in test environments hits Next.js's internal cache, which doesn't
// replay mocked args — the wrapper makes the original function uncallable in tests.)
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));


import {
  getActivePaymentMethods,
  getActiveShippingMethods,
  getPaymentMethodMap,
  resolvePaymentMethodName,
  resolveShippingMethodName,
} from "@/lib/services/method.service";

describe("method.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getActivePaymentMethods", () => {
    it("returns active payment methods", async () => {
      mocks.findManyPayment.mockResolvedValue([
        { code: "cash", name: "Tunai" },
        { code: "transfer", name: "Transfer Bank" },
      ]);

      const result = await getActivePaymentMethods();

      expect(result).toEqual([
        { code: "cash", name: "Tunai" },
        { code: "transfer", name: "Transfer Bank" },
      ]);
      expect(mocks.findManyPayment).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { code: true, name: true },
      });
    });
  });

  describe("getActiveShippingMethods", () => {
    it("returns active shipping methods", async () => {
      mocks.findManyShipping.mockResolvedValue([{ code: "pickup", name: "Ambil Sendiri" }]);

      const result = await getActiveShippingMethods();

      expect(result).toEqual([{ code: "pickup", name: "Ambil Sendiri" }]);
    });
  });

  describe("getPaymentMethodMap", () => {
    it("builds a code->name map", async () => {
      mocks.findManyPayment.mockResolvedValue([
        { code: "cash", name: "Tunai" },
        { code: "qris", name: "QRIS" },
      ]);

      const result = await getPaymentMethodMap();

      expect(result).toEqual({ cash: "Tunai", qris: "QRIS" });
    });

    it("returns empty object when no methods", async () => {
      mocks.findManyPayment.mockResolvedValue([]);

      const result = await getPaymentMethodMap();

      expect(result).toEqual({});
    });
  });

  describe("resolvePaymentMethodName", () => {
    it("returns - when code is null/undefined", () => {
      expect(resolvePaymentMethodName(null)).toBe("-");
      expect(resolvePaymentMethodName(undefined)).toBe("-");
    });

    it("resolves from provided map first", () => {
      expect(resolvePaymentMethodName("cash", { cash: "Tunai Custom" })).toBe("Tunai Custom");
    });

    it("falls back to raw code when not in map and no static label", () => {
      expect(resolvePaymentMethodName("unknown_xyz", {})).toBe("unknown_xyz");
    });

    it("falls back to static label when code not in provided map", () => {
      // map present but missing "cash" → resolves via static paymentMethodLabel
      expect(resolvePaymentMethodName("cash", { transfer: "Transfer X" })).toBe("Tunai");
    });

    it("resolves without a map argument", () => {
      const result = resolvePaymentMethodName("cash");
      expect(typeof result).toBe("string");
      expect(result).not.toBe("-");
    });
  });

  describe("resolveShippingMethodName", () => {
    it("returns - when code is null/undefined", () => {
      expect(resolveShippingMethodName(null)).toBe("-");
      expect(resolveShippingMethodName(undefined)).toBe("-");
    });

    it("resolves from provided map first", () => {
      expect(resolveShippingMethodName("pickup", { pickup: "Ambil Sendiri" })).toBe("Ambil Sendiri");
    });

    it("falls back to raw code when unknown", () => {
      expect(resolveShippingMethodName("weird_code", {})).toBe("weird_code");
    });

    it("falls back to static label when code not in provided map", () => {
      expect(resolveShippingMethodName("pickup", { courier: "Kurir X" })).toBe("Ambil Sendiri");
    });
  });
});
