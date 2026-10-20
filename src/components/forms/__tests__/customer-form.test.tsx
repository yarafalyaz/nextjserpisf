// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { CustomerForm } from "../customer-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

describe("CustomerForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pelanggan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      // 2 bintang visual (Nama wajib schema, Telepon bintang visual) keduanya dekoratif
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Pelanggan *", "Telepon *"]))
      // name wajib di schema -> aria-required; phone opsional di schema -> tidak dipaksakan
      expect(container.querySelector("#name")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#phone")!.getAttribute("aria-required")).toBeNull()
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pelanggan + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <CustomerForm
          customer={{
            id: 3, name: "Budi Santoso", email: null, phone: "0812", address: null,
            city: null, province: null, district: null, village: null,
            postalCode: null, contactPerson: null, gender: null, code: "CUST-001",
          }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pelanggan")
      expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("Budi Santoso")
      unmount(root, container)
    })
  })
})
