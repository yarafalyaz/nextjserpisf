// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";

import { QuotationInvoiceThresholdCard } from "../quotation-invoice-threshold-card";
import { buildInvoiceThresholdInfo } from "@/lib/sales/invoice-threshold";
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils";

afterEach(() => {
  clearRenderedCards();
});

describe("QuotationInvoiceThresholdCard F-2026-10-22-065-S", () => {
  it("snapshot kategori 30: persen + label sumber verbatim server (AC-DP65-6)", () => {
    const info = buildInvoiceThresholdInfo(30);
    const { container, root } = renderCard(
      <QuotationInvoiceThresholdCard info={info} />,
    );
    const text = container.textContent ?? "";
    expect(
      container.querySelector('[aria-label="Ambang Invoice Penawaran"]'),
    ).not.toBeNull();
    expect(text).toContain("Ambang invoice dari kategori pelanggan: 30%");
    expect(text).toContain("30%");
    unmountCard(root);
  });

  it("snapshot kosong: default 50 verbatim server (AC-DP65-6/7)", () => {
    const info = buildInvoiceThresholdInfo(null);
    const { container, root } = renderCard(
      <QuotationInvoiceThresholdCard info={info} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Ambang invoice default: 50%");
    expect(text).toContain("50%");
    unmountCard(root);
  });

  it("snapshot korup 150: fail-closed server 50, UI tampil apa adanya (AC-DP65-7)", () => {
    const info = buildInvoiceThresholdInfo(150);
    const { container, root } = renderCard(
      <QuotationInvoiceThresholdCard info={info} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Ambang invoice default: 50%");
    expect(text).not.toContain("150%");
    unmountCard(root);
  });
});
