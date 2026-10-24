// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

import { QuotationForm } from "../quotation-form";
import {
  mountInto,
  unmount,
  withContainer,
} from "./form-a11y-test-utils";

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule);
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule);
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule);
vi.mock("@/actions/sales.actions", () => ({
  createQuotation: vi.fn().mockResolvedValue({ success: true }),
  updateQuotation: vi.fn().mockResolvedValue({ success: true }),
}));

describe("QuotationForm — ambang invoice F-2026-10-22-065-S", () => {
  it("dengan edit_quotations: persen + label sumber server tampil, field baca-saja (AC-DP65-6/8)", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <QuotationForm
          customers={[]}
          customerVehicles={[]}
          items={[]}
          invoiceThreshold={{
            percent: 30,
            sourceLabel: "Ambang invoice dari kategori pelanggan: 30%",
          }}
          canEditQuotations
        />,
      );
      const field = container.querySelector<HTMLInputElement>(
        "#invoiceThresholdPercent",
      )!;
      expect(field).not.toBeNull();
      expect(field.value).toBe("30%");
      expect(field.readOnly).toBe(true);
      expect(field.disabled).toBe(false);
      expect(container.textContent ?? "").toContain(
        "Ambang invoice dari kategori pelanggan: 30%",
      );
      unmount(root, container);
    });
  });

  it("tanpa edit_quotations: field disabled/baca-saja + penjelasan (AC-DP65-8)", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <QuotationForm
          customers={[]}
          customerVehicles={[]}
          items={[]}
          invoiceThreshold={{
            percent: 50,
            sourceLabel: "Ambang invoice default: 50%",
          }}
          canEditQuotations={false}
        />,
      );
      const field = container.querySelector<HTMLInputElement>(
        "#invoiceThresholdPercent",
      )!;
      expect(field.value).toBe("50%");
      expect(field.readOnly).toBe(true);
      expect(field.disabled).toBe(true);
      expect(container.textContent ?? "").toContain(
        "Ambang invoice default: 50%",
      );
      expect(container.textContent ?? "").toContain(
        "Hanya baca: ubah ambang memerlukan izin edit_quotations.",
      );
      unmount(root, container);
    });
  });

  it("tanpa info server: field ambang tidak tampil (jangan karang nilai)", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <QuotationForm customers={[]} customerVehicles={[]} items={[]} />,
      );
      expect(container.querySelector("#invoiceThresholdPercent")).toBeNull();
      unmount(root, container);
    });
  });
});
