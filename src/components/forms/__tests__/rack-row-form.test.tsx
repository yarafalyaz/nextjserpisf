// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { RackRowForm } from "../rack-row-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => ({ ...(await import("./form-a11y-test-utils")).routerModule, useSearchParams: () => new URLSearchParams() }))
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", () => ({ QUICK_ADD: { warehouse: { title: "Gudang", fields: [], action: vi.fn() } } }))
vi.mock("@/actions/inventory.actions", () => ({ createRackRow: vi.fn(), updateRackRow: vi.fn(), getNextRowCode: vi.fn() }))

const warehouses = [{ id: 1, name: "Gudang Utama", racks: [{ id: 7, name: "Rak A" }] }]

describe("rack-row-form — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, combobox wajib aria-required, 3 bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <RackRowForm warehouses={warehouses} enableAutoCode={false} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah baris rak")
      expect(form.getAttribute("aria-busy")).toBe("false")
      const requiredComboboxes = container.querySelectorAll('[role="combobox"][aria-required="true"]')
      expect(requiredComboboxes.length).toBe(2)
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Gudang *", "Rak *", "Nama *"]))
      unmount(root, container)
    })
  })
  it("ubah: label ubah + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, <RackRowForm warehouses={warehouses} enableAutoCode={false} rackRow={{ id: 3, rackId: 7, code: "A-01", name: "Baris 1", rack: { id: 7, warehouseId: 1 } }} />)
      expect(container.querySelector("form")?.getAttribute("aria-label")).toBe("Formulir ubah baris rak")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Baris 1")
      unmount(root, container)
    })
  })
})
