// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { SalesInvoiceForm } from "../sales-invoice-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createSalesInvoice: vi.fn().mockResolvedValue({ success: true }),
  updateSalesInvoice: vi.fn().mockResolvedValue({ success: true }),
}))

const baseProps = {
  customers: [{ id: 1, name: "Pelanggan A" }],
  salesOrders: [],
  availableItems: [
    { id: 1, name: "Plat Baja", sku: "PLT-1", price: 1000, isScrapSaleItem: false },
    { id: 2, name: "Sisa Potongan", sku: "SCR-1", price: 500, isScrapSaleItem: true },
  ],
}

describe("SalesInvoiceForm — besi tua F-135-V", () => {
  it("campuran scrap + dagang: peringatan tampil", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <SalesInvoiceForm
          {...baseProps}
          initialItems={[
            { itemId: 1, qty: 1, unitPrice: 1000, discount: 0 },
            { itemId: 2, qty: 1, unitPrice: 500, discount: 0 },
          ]}
        />
      ))
      expect(container.textContent).toContain("Faktur campuran besi tua")
      expect(container.textContent).toContain("server menolak posting faktur campuran")
      unmount(root, container)
    })
  })

  it("murni scrap: peringatan campuran sembunyi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <SalesInvoiceForm
          {...baseProps}
          initialItems={[{ itemId: 2, qty: 1, unitPrice: 500, discount: 0 }]}
        />
      ))
      expect(container.textContent).not.toContain("Faktur campuran besi tua")
      unmount(root, container)
    })
  })
})
