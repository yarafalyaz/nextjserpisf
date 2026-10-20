// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { createElement, type ComponentType } from "react"
import { PaymentMethodForm } from "../payment-method-form"
import { ShippingMethodForm } from "../shipping-method-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/method.actions", () => ({
  createPaymentMethod: vi.fn(), updatePaymentMethod: vi.fn(),
  createShippingMethod: vi.fn(), updateShippingMethod: vi.fn(),
}))

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never

const cases: { title: string; component: ComponentType<any>; noun: string; activeId: string }[] = [
  { title: "PaymentMethodForm", component: PaymentMethodForm, noun: "metode pembayaran", activeId: "pm-is-active" },
  { title: "ShippingMethodForm", component: ShippingMethodForm, noun: "metode pengiriman", activeId: "sm-is-active" },
]

for (const c of cases) {
  describe(`${c.title} — a11y wiring`, () => {
    it("form aria-label tambah + aria-busy false; nama required; bintang dekoratif aria-hidden; kode auto read-only tanpa bintang", () => {
      withContainer((container) => {
        const root = mountInto(container, createElement(c.component, {}))
        const form = container.querySelector("form")!
        expect(form.getAttribute("aria-label")).toBe(`Formulir tambah ${c.noun}`)
        expect(form.getAttribute("aria-busy")).toBe("false")
        expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
        expect(container.querySelector("#code")!.hasAttribute("readonly")).toBe(true)
        expect(decorativeStars(form).length).toBe(1)
        expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama *", "Kode "]))
        expect(container.querySelector(`#${c.activeId}`)).not.toBeNull()
        unmount(root, container)
      })
    })
    it("mode ubah: label ubah + nama+kode terisi", () => {
      withContainer((container) => {
        const root = mountInto(container, createElement(c.component, { method: { id: 3, code: "MP01", name: "Transfer", isActive: true } }))
        expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(`Formulir ubah ${c.noun}`)
        expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Transfer")
        expect(container.querySelector<HTMLInputElement>("#code")?.value).toBe("MP01")
        unmount(root, container)
      })
    })
  })
}
