// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { CustomerCategoryForm } from "../customer-category-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)

describe("CustomerCategoryForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; 2 input required; 2 bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerCategoryForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah kategori pelanggan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#downPaymentPercent")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Nama Kategori *", "Persentase Uang Muka (DP) (%) *"]),
      )
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerCategoryForm category={{ id: 3, name: "Fleet", downPaymentPercent: 20 }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah kategori pelanggan")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Fleet")
      expect(container.querySelector<HTMLInputElement>("#downPaymentPercent")?.value).toBe("20")
      unmount(root, container)
    })
  })
})
