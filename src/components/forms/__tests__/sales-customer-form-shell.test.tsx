// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { DownPaymentForm } from "../down-payment-form"
import { SalesInvoiceForm } from "../sales-invoice-form"
import { SalesOrderForm } from "../sales-order-form"
import {
  mountInto, unmount, withContainer,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/sales.actions", () => ({
  createDownPayment: vi.fn(),
  updateDownPayment: vi.fn(),
  createSalesInvoice: vi.fn(),
  updateSalesInvoice: vi.fn(),
  createSalesOrder: vi.fn(),
  updateSalesOrder: vi.fn(),
}))
vi.mock("@/actions/credit-override.actions", () => ({
  getMyCreditOverrideStatus: vi.fn(),
  approveCreditOverride: vi.fn(),
  rejectCreditOverride: vi.fn(),
  listCreditOverrides: vi.fn(),
}))

describe("SalesCustomerFormShell — a11y wiring", () => {
  it("uang muka: aria-label tambah + busy + pelanggan required", () => {
    withContainer((container) => {
      const root = mountInto(container, <DownPaymentForm customers={[]} quotations={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah uang muka")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
      // Label bersih; bintang wajib hanya dekoratif (pola AppDatePicker #458).
      const label = container.querySelector('label[for="customerId"]')!
      expect(label.textContent).toBe("Pelanggan *")
      const star = label.querySelector('span[aria-hidden="true"]')
      expect(star?.textContent).toBe("*")
      expect(star?.classList.contains("text-destructive")).toBe(true)
      unmount(root, container)
    })
  })

  it("uang muka: aria-label ubah", () => {
    withContainer((container) => {
      const root = mountInto(container, <DownPaymentForm customers={[]} quotations={[]} downPayment={{ id: 1, customerId: 2, amount: 100, date: "2026-10-21" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah uang muka")
      unmount(root, container)
    })
  })

  it("faktur: aria-label tambah/ubah", () => {
    withContainer((container) => {
      const root = mountInto(container, <SalesInvoiceForm customers={[]} salesOrders={[]} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir tambah faktur")
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <SalesInvoiceForm customers={[]} salesOrders={[]} invoice={{ id: 7, customerId: 2, date: "2026-10-21" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah faktur")
      unmount(root, container)
    })
  })

  it("pesanan: aria-label tambah/ubah", () => {
    withContainer((container) => {
      const root = mountInto(container, <SalesOrderForm customers={[]} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir tambah pesanan")
      unmount(root, container)
    })
    withContainer((container) => {
      const root = mountInto(container, <SalesOrderForm customers={[]} order={{ id: 9, customerId: 2, date: "2026-10-21" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pesanan")
      unmount(root, container)
    })
  })
})

describe("Shell consumers — field required/opsional (verifikasi t_9c46d94b)", () => {
  it("pesanan: pelanggan + tanggal wajib; pengiriman + catatan opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <SalesOrderForm customers={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pesanan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#deliveryDate-trigger")!.getAttribute("aria-required")).not.toBe("true")
      expect(container.querySelector("#notes")!.hasAttribute("required")).toBe(false)
      unmount(root, container)
    })
  })

  it("faktur: pelanggan + tanggal wajib; jatuh tempo opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <SalesInvoiceForm customers={[]} salesOrders={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah faktur")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#customerId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#dueDate-trigger")!.getAttribute("aria-required")).not.toBe("true")
      unmount(root, container)
    })
  })
})
