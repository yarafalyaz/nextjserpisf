import { describe, expect, it } from "vitest";
import { salesInvoiceLabel } from "../invoice-label";

describe("salesInvoiceLabel", () => {
  it("memakai documentNo apa adanya bila sudah terbit", () => {
    expect(salesInvoiceLabel({ id: 7, documentNo: "INV/2026/10/0007" })).toBe(
      "INV/2026/10/0007",
    );
  });

  it("memakai label DRAFT #<id> bila documentNo null (belum posting)", () => {
    expect(salesInvoiceLabel({ id: 42, documentNo: null })).toBe("DRAFT #42");
  });
});
