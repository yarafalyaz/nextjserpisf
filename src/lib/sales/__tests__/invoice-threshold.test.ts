import { describe, it, expect, vi } from "vitest";

import {
  buildInvoiceThresholdInfo,
  computeInvoiceThresholdSen,
  resolveInvoiceThresholdPercent,
} from "../invoice-threshold";

/**
 * F-2026-10-22-065-S: persen snapshot fail-closed ke 50 (AC-DP65-2/5),
 * ambang sen dibulatkan ke atas persis pola existing (BR-DP65-04).
 */
describe("invoice-threshold helper", () => {
  it("snapshot sah dipakai apa adanya (30 -> 30, 100 -> 100)", () => {
    expect(resolveInvoiceThresholdPercent(30)).toBe(30);
    expect(resolveInvoiceThresholdPercent(100)).toBe(100);
    expect(resolveInvoiceThresholdPercent(0.5)).toBe(0.5);
  });

  it("snapshot kosong fail-closed ke 50 tanpa callback korup", () => {
    const onInvalid = vi.fn();
    expect(resolveInvoiceThresholdPercent(null, onInvalid)).toBe(50);
    expect(resolveInvoiceThresholdPercent(undefined, onInvalid)).toBe(50);
    expect(resolveInvoiceThresholdPercent(0, onInvalid)).toBe(50);
    expect(onInvalid).not.toHaveBeenCalled();
  });

  it("snapshot korup fail-closed ke 50 + callback log (AC-DP65-5)", () => {
    const onInvalid = vi.fn();
    expect(resolveInvoiceThresholdPercent(-5, onInvalid)).toBe(50);
    expect(resolveInvoiceThresholdPercent(150, onInvalid)).toBe(50);
    expect(resolveInvoiceThresholdPercent("abc", onInvalid)).toBe(50);
    expect(onInvalid).toHaveBeenCalledTimes(3);
  });

  it("ambang sen: 30% dari Rp1.000 = Rp300; 100% = lunas penuh; Rp1 33% ceil ke 33 sen", () => {
    expect(computeInvoiceThresholdSen(100_000, 30)).toBe(30_000);
    expect(computeInvoiceThresholdSen(100_000, 100)).toBe(100_000);
    expect(computeInvoiceThresholdSen(100, 33)).toBe(33);
    expect(computeInvoiceThresholdSen(100, 50)).toBe(50);
  });

  it("label sumber verbatim untuk UI (AC-DP65-6/7)", () => {
    expect(buildInvoiceThresholdInfo(30)).toEqual({
      percent: 30,
      sourceLabel: "Ambang invoice dari kategori pelanggan: 30%",
    });
    expect(buildInvoiceThresholdInfo(null)).toEqual({
      percent: 50,
      sourceLabel: "Ambang invoice default: 50%",
    });
    expect(buildInvoiceThresholdInfo(150).sourceLabel).toBe("Ambang invoice default: 50%");
  });
});
