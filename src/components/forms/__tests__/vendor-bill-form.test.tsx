// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { VendorBillForm } from "../vendor-bill-form"
import {
  assertFormEditLabel,
  decorativeStars,
  labelTexts,
  mountInto,
  unmount,
  withContainer,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)

vi.mock("@/actions/purchase.actions", () => ({
  createVendorBill: vi.fn().mockResolvedValue({ success: true }),
  updateVendorBill: vi.fn().mockResolvedValue({ success: true }),
}))

// QuickAddSelect resolves its target via the registry, which statically imports
// server actions (next-auth/next-server). Stub it so this unit test stays pure.
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)

const vendors = [{ id: 1, name: "Pemasok A" }]
const items = [{ id: 7, sku: "SKU-7", name: "Baut M8", cost: 1000, unitOfMeasure: "pcs" }]

describe("vendor-bill-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, Pemasok bintang dekoratif + wajib, opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah tagihan pemasok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pemasok *", "PO Terkait", "Jenis PPh"]))
      expect(container.querySelector("#vendorId")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#purchaseOrderId")!.getAttribute("aria-required")).not.toBe("true")
      expect(container.querySelector("#date-trigger")!.getAttribute("aria-required")).toBe("true")
      unmount(root, container)
    })
  })

  it("ubah: aria-label ubah tagihan pemasok", () => {
    const bill = { id: 9, vendorId: 1, date: "2026-10-22" }
    withContainer((container) => {
      const root = mountInto(container, <VendorBillForm vendors={vendors} items={items} bill={bill} />)
      assertFormEditLabel(container, "Formulir ubah tagihan pemasok")
      unmount(root, container)
    })
  })
})
