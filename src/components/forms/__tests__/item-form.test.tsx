// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

// Radix (Combobox/Checkbox) pakai ResizeObserver; jsdom tidak punya.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { ItemForm } from "../item-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/master.actions", () => ({
  createItem: vi.fn().mockResolvedValue({ success: true }),
  updateItem: vi.fn().mockResolvedValue({ success: true }),
}))

const baseProps = {
  categories: [{ id: 1, name: "Kategori A" }],
  groups: [],
  brands: [{ id: 1, name: "Merek A" }],
  vendors: [{ id: 1, name: "Pemasok A" }],
  warehouses: [{ id: 1, name: "Gudang A" }],
  racks: [{ id: 1, name: "Rak A", warehouseId: 1 }],
  rackRows: [],
}

describe("ItemForm — a11y wiring", () => {
  it("aria-label tambah + busy false; 9 bintang dekoratif; kontrol wajib required, opsional bersih", () => {
    withContainer((container) => {
      const root = mountInto(container, <ItemForm {...baseProps} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah item")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(9)
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining([
          "Nama Item *", "Gambar Item *", "Merek *", "Kategori *", "Pemasok *",
          "Harga Beli (Rp) *", "Harga Jual (Rp) *", "Gudang Bawaan *", "Rak *",
          "SKU", "Grup Barang", "Satuan", "Minimum Stok", "Baris", "Deskripsi",
        ]),
      )
      for (const id of ["brandId", "categoryId", "vendorId", "defaultWarehouseId", "defaultRackId"]) {
        expect(container.querySelector(`#${id}`)!.getAttribute("aria-required"), id).toBe("true")
      }
      for (const id of ["name", "cost", "price"]) {
        expect(container.querySelector(`#${id}`)!.hasAttribute("required"), id).toBe(true)
      }
      for (const id of ["groupId", "defaultRackRowId"]) {
        expect(container.querySelector(`#${id}`)!.getAttribute("aria-required"), id).not.toBe("true")
      }
      expect(container.querySelector("#sku")!.hasAttribute("required")).toBe(false)
      expect(container.querySelector("#minStock")!.hasAttribute("required")).toBe(false)
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah item", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ItemForm
          {...baseProps}
          item={{
            id: 7, sku: "SKU-1", name: "Item A", description: null, image: "img.png",
            categoryId: 1, brandId: 1, vendorId: 1, defaultWarehouseId: 1, defaultRackId: 1,
            defaultRackRowId: null, unitOfMeasure: "PCS", minStock: 0, cost: 100, price: 200,
            standardCost: null, costingMethod: null, purchasePrice: null, isProduct: true,
          }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah item")
      unmount(root, container)
    })
  })
})
