// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { VendorForm } from "../vendor-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
}))

describe("VendorForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <VendorForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pemasok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Pemasok *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pemasok + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <VendorForm
          vendor={{
            id: 3, code: "VND-001", name: "PT Suku Cadang", email: null, phone: null,
            address: null, city: null, province: null, districtVendor: null,
            villageVendor: null, postalCode: null, npwp: null, contactPerson: null,
            paymentTermId: null,
          }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pemasok")
      expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("PT Suku Cadang")
      unmount(root, container)
    })
  })
})
