import { describe, it, expect } from "vitest";
import {
  parseMaterialRows,
  parseRevisionRows,
} from "@/lib/validations/manufacturing.schemas";

describe("validations/manufacturing qty BOM format Indonesia", () => {
  it("parseMaterialRows membaca desimal koma dan ribuan titik penuh", () => {
    expect(parseMaterialRows(["1"], ["1,5"])).toEqual({
      success: true,
      data: [{ itemId: 1, qty: 1.5 }],
    });
    expect(parseMaterialRows(["1"], ["1.000"])).toEqual({
      success: true,
      data: [{ itemId: 1, qty: 1000 }],
    });
    expect(parseMaterialRows(["1"], ["1.000,5"])).toEqual({
      success: true,
      data: [{ itemId: 1, qty: 1000.5 }],
    });
  });

  it("parseRevisionRows membaca qty format Indonesia penuh", () => {
    expect(parseRevisionRows(["2"], ["2,5"])).toEqual({
      success: true,
      data: [{ itemId: 2, qty: 2.5 }],
    });
    expect(parseRevisionRows(["2"], ["2.000"])).toEqual({
      success: true,
      data: [{ itemId: 2, qty: 2000 }],
    });
  });

  it("qty tak terbaca dan di atas cap tetap ditolak", () => {
    expect(parseMaterialRows(["1"], ["abc"]).success).toBe(false);
    expect(parseMaterialRows(["1"], ["1.000.001"]).success).toBe(false);
    expect(parseRevisionRows(["1"], ["abc"]).success).toBe(false);
  });
});
