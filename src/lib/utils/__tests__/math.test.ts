import { describe, it, expect } from "vitest"
import {
  safeRound,
  safeAdd,
  safeSubtract,
  safeMultiply,
  safeDivide,
  safeSum,
  compareAmounts,
} from "../math"

describe("Precise Math Utility", () => {
  describe("safeRound", () => {
    it("rounds floats to integers (IDR defaults)", () => {
      expect(safeRound(1500.49)).toBe(1500)
      expect(safeRound(1500.5)).toBe(1501)
      expect(safeRound(1500.51)).toBe(1501)
    });

    it("rounds to specified decimal places", () => {
      // Classic JS float bug: 1.005 * 100 = 100.49999999999999
      expect(safeRound(1.005, 2)).toBe(1.01)
      expect(safeRound(1.004, 2)).toBe(1.00)
    });

    it("handles null, undefined, NaN, and Infinity safely", () => {
      expect(safeRound(null)).toBe(0)
      expect(safeRound(undefined)).toBe(0)
      expect(safeRound("abc")).toBe(0)
      expect(safeRound(Infinity)).toBe(0)
    });

    it("handles objects with toString or toNumber methods (like Prisma.Decimal)", () => {
      const obj1 = { toString: () => "5.5" }
      const obj2 = { toNumber: () => 10.123, toString: () => "10.123" }
      expect(safeRound(obj1, 0)).toBe(6)
      expect(safeRound(obj2, 2)).toBe(10.12)
    });

    it("rounds tiny numbers that stringify in scientific notation without producing NaN", () => {
      // JS serializes magnitudes < 1e-6 in exponential form: (1e-7).toString() === "1e-7".
      // The naive `num + "e" + decimals` shift then builds "1e-7e2" -> Number(...) === NaN,
      // which silently poisons any money/inventory calculation downstream.
      expect(safeRound(1e-7, 2)).toBe(0)
      expect(safeRound(0.0000005, 2)).toBe(0)
      expect(safeRound(1e-7, 8)).toBe(1e-7)
      expect(safeRound(1.5e-7, 7)).toBe(2e-7)
    });

    it("rounds very large numbers that stringify in scientific notation without producing NaN", () => {
      // (1e21).toString() === "1e+21" — same exponential-string trap on the high end.
      expect(safeRound(1e21, 2)).toBe(1e21)
      expect(safeRound(1.23e21, 0)).toBe(1.23e21)
    });
  });

  describe("safeAdd / safeSubtract / safeMultiply / safeDivide", () => {
    it("performs float additions without precision drift", () => {
      // 0.1 + 0.2 === 0.30000000000000004
      expect(safeAdd(0.1, 0.2, 1)).toBe(0.3)
      expect(safeAdd(150000, 250000)).toBe(400000)
    });

    it("performs safe subtractions", () => {
      expect(safeSubtract(100.1, 0.1, 0)).toBe(100)
    });

    it("multiplies cleanly", () => {
      expect(safeMultiply(3, 150.333, 0)).toBe(451)
    });

    it("divides and avoids division by zero crashes", () => {
      expect(safeDivide(100, 3, 2)).toBe(33.33)
      expect(safeDivide(100, 0)).toBe(0)
    });
  });

  describe("safeSum", () => {
    it("sums values while preventing decimal drift propagation", () => {
      const vals = [0.1, 0.2, 0.3] // total 0.6
      expect(safeSum(vals, 1)).toBe(0.6)
      expect(safeSum([150.5, 250.5, 100], 0)).toBe(502) // 151 + 251 + 100
    });
  });

  describe("compareAmounts", () => {
    it("checks ledger balances with zero-tolerance or small tolerance", () => {
      expect(compareAmounts(1000.0001, 1000, 0.01)).toBe(true)
      expect(compareAmounts(1000, 1000)).toBe(true)
      expect(compareAmounts(1000, 1001)).toBe(false)
    });
  });
});
