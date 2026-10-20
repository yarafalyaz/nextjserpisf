// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { InventoryTransferForm } from "../inventory-transfer-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/inventory.actions", () => ({
  createInventoryTransfer: vi.fn().mockResolvedValue({ success: true }),
  updateInventoryTransfer: vi.fn().mockResolvedValue({ success: true }),
}))

const warehouses = [
  { id: 1, name: "Gudang Utama" },
  { id: 2, name: "Gudang Cadangan" },
]
const items = [{ id: 7, sku: "BRG-001", name: "Busi", qtyOnHand: "10" }]

describe("InventoryTransferForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox gudang aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <InventoryTransferForm warehouses={warehouses} items={items} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah transfer stok")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(2)
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Dari Gudang *", "Ke Gudang *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah transfer stok", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <InventoryTransferForm
          warehouses={warehouses}
          items={items}
          transfer={{ id: 3, sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-10-20", items: [{ itemId: 7, qty: 2 }] }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah transfer stok")
      unmount(root, container)
    })
  })
})
