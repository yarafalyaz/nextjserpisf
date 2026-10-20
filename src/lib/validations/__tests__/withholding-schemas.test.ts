import { describe, it, expect } from "vitest";
import { parseFormData } from "../parse-form";
import { withholdingTaxTypeSchema } from "../withholding.schemas";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.append(k, v);
  return f;
}

describe("withholdingTaxTypeSchema via parseFormData", () => {
  it("checkbox mati (isActive dihapus form) tetap false, bukan aktif kembali", () => {
    const r = parseFormData(withholdingTaxTypeSchema, fd({ code: "PPH23", name: "PPh 23", rate: "2" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });

  it("isActive=true aktif", () => {
    const r = parseFormData(withholdingTaxTypeSchema, fd({ code: "PPH23", name: "PPh 23", isActive: "true" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(true);
  });

  it("isActive=false tetap false", () => {
    const r = parseFormData(withholdingTaxTypeSchema, fd({ code: "PPH23", name: "PPh 23", isActive: "false" }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });

  it("rate di luar 0-100 ditolak", () => {
    const r = parseFormData(withholdingTaxTypeSchema, fd({ code: "PPH23", name: "PPh 23", rate: "101" }));
    expect(r.success).toBe(false);
  });

  it("kode kosong ditolak", () => {
    const r = parseFormData(withholdingTaxTypeSchema, fd({ name: "PPh 23" }));
    expect(r.success).toBe(false);
  });
});
