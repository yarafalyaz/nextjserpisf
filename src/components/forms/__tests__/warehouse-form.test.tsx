// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { WarehouseForm } from "../warehouse-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({ createWarehouse: vi.fn(), updateWarehouse: vi.fn() }))

describe("WarehouseForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <WarehouseForm generatedCode="GDG-001" />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah gudang")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode Gudang *", "Nama Gudang *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah gudang + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, <WarehouseForm warehouse={{ id: 3, name: "Gudang Utama", code: "GDG-001", address: null }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah gudang")
      expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("Gudang Utama")
      unmount(root, container)
    })
  })
})
