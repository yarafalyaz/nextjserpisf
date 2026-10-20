// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { PurchaseRequestForm } from "../purchase-request-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/purchase.actions", () => ({
  createPurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
  updatePurchaseRequest: vi.fn().mockResolvedValue({ success: true }),
}))

const mockItems = [
  { id: 7, sku: "BRG-7", name: "Plat Baja", unitOfMeasure: "lembar" },
  { id: 9, sku: "BRG-9", name: "Busi", unitOfMeasure: "pcs" },
]
const mockEmployees = [{ id: 1, name: "Staf Gudang" }]

function qtyValues(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[aria-label^="Jumlah baris"]')).map((i) => i.value)
}

describe("PurchaseRequestForm — prefill stok minimum", () => {
  it("mengisi baris awal dari initialItems dengan qty saran", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <PurchaseRequestForm items={mockItems} employees={mockEmployees} initialItems={[{ itemId: 7, qty: 5 }, { itemId: 9, qty: 2 }]} />
      ))
      expect(qtyValues(container)).toEqual(["5", "2"])
      unmount(root, container)
    })
  })

  it("tanpa initialItems tetap satu baris kosong qty 1", () => {
    withContainer((container) => {
      const root = mountInto(container, <PurchaseRequestForm items={mockItems} employees={mockEmployees} />)
      expect(qtyValues(container)).toEqual(["1"])
      unmount(root, container)
    })
  })
})
