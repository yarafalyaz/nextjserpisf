// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

// Radix (Combobox/Checkbox) pakai ResizeObserver; jsdom tidak punya.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { ItemForm } from "../item-form"
import { showError, showSuccess } from "@/lib/utils/toast"
import { createItem, updateItem } from "@/actions/master.actions"
import { mountInto, unmount, withContainer, labelTexts, setFieldValue } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/master.actions", () => ({
  createItem: vi.fn(),
  updateItem: vi.fn(),
}))

const baseProps = {
  categories: [{ id: 1, name: "Kategori A" }],
  groups: [],
  brands: [{ id: 1, name: "Merek A" }],
  vendors: [{ id: 1, name: "Pemasok A" }],
  warehouses: [{ id: 1, name: "Gudang A" }],
  racks: [{ id: 1, name: "Rak A", warehouseId: 1 }],
  rackRows: [],
  taxOptions: [
    { id: 7, label: "PPN11 — PPN Keluaran (11%)" },
    { id: 9, label: "PPN0 — PPN Nol (0%)" },
  ],
}

const editItem = {
  id: 7, sku: "SKU-7", name: "Item Pajak", description: null, image: "img.png",
  categoryId: 1, brandId: 1, vendorId: 1, defaultWarehouseId: 1, defaultRackId: 1,
  defaultRackRowId: null, unitOfMeasure: "PCS", minStock: 0, cost: 100, price: 200,
  standardCost: null, costingMethod: null, purchasePrice: null, isProduct: true,
}

async function submitForm(container: HTMLElement) {
  const { act } = await import("react")
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
}

describe("ItemForm — default pajak per item F-2026-10-25-041-S", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createItem).mockResolvedValue({ success: true, id: 1, slug: "item-baru" })
    vi.mocked(updateItem).mockResolvedValue({ success: true })
  })

  it("section Pajak Default: label terikat, opsi server, persen kosong + hint verbatim", () => {
    withContainer((container) => {
      const root = mountInto(container, <ItemForm {...baseProps} />)
      const form = container.querySelector("form")!
      expect(labelTexts(form)).toEqual(expect.arrayContaining([
        "Kode Pajak Penjualan Default", "Kode Pajak Pembelian Default", "Persen DPP Default (%)",
      ]))
      expect(container.querySelector("#defaultSalesTaxId")).not.toBeNull()
      expect(container.querySelector("#defaultPurchaseTaxId")).not.toBeNull()
      const persen = container.querySelector<HTMLInputElement>("#defaultDppPercent")!
      expect(persen.value).toBe("")
      expect(persen.getAttribute("aria-describedby")).toBe("defaultDppPercent-hint")
      expect(container.querySelector("#defaultDppPercent-hint")!.textContent).toContain("PPN tetap ditentukan di level dokumen")
      expect(form.textContent).toContain("edit master tidak mengubah baris yang sudah dibuat")
      unmount(root, container)
    })
  })

  it("tanpa kode pajak aktif: pesan kosong jujur tampil", () => {
    withContainer((container) => {
      const root = mountInto(container, <ItemForm {...baseProps} taxOptions={[]} />)
      expect(container.textContent).toContain("Belum ada kode pajak aktif di master pajak")
      unmount(root, container)
    })
  })

  it("mode ubah: nilai tersimpan terisi apa adanya (id + persen Decimal)", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ItemForm
          {...baseProps}
          item={{
            id: 7, sku: "SKU-7", name: "Item Pajak", description: null, image: "img.png",
            categoryId: 1, brandId: 1, vendorId: 1, defaultWarehouseId: 1, defaultRackId: 1,
            defaultRackRowId: null, unitOfMeasure: "PCS", minStock: 0, cost: 100, price: 200,
            standardCost: null, costingMethod: null, purchasePrice: null, isProduct: true,
            defaultSalesTaxId: 7, defaultPurchaseTaxId: null, defaultDppPercent: 50.25,
          }}
        />
      ))
      expect(container.querySelector<HTMLInputElement>("#defaultDppPercent")!.value).toBe("50.25")
      expect(container.textContent).toContain("PPN11 — PPN Keluaran (11%)")
      unmount(root, container)
    })
  })

  it("besi tua: kontrol pajak nonaktif (server tetap otoritas penolakan)", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <ItemForm
          {...baseProps}
          item={{
            id: 8, sku: "SCR-1", name: "Besi Tua", description: null, image: "img.png",
            categoryId: 1, brandId: 1, vendorId: 1, defaultWarehouseId: 1, defaultRackId: 1,
            defaultRackRowId: null, unitOfMeasure: "KG", minStock: 0, cost: 100, price: 200,
            standardCost: null, costingMethod: null, purchasePrice: null, isProduct: false,
            isScrapSaleItem: true,
          }}
        />
      ))
      expect(container.querySelector<HTMLInputElement>("#defaultDppPercent")!.disabled).toBe(true)
      expect(container.querySelector("#defaultSalesTaxId")!.closest("[data-disabled], [disabled]") ?? container.querySelector("#defaultSalesTaxId")!.getAttribute("data-disabled")).toBeTruthy()
      unmount(root, container)
    })
  })

  it("submit ubah tanpa default: kunci pajak selalu terkirim kosong (= kosongkan)", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <ItemForm {...baseProps} item={editItem} />)
    setFieldValue(container.querySelector<HTMLInputElement>("#defaultDppPercent")!, "50")
    await submitForm(container)
    expect(vi.mocked(updateItem)).toHaveBeenCalled()
    const fd = vi.mocked(updateItem).mock.calls[0][1] as FormData
    expect(fd.has("defaultSalesTaxId")).toBe(true)
    expect(fd.get("defaultSalesTaxId")).toBe("")
    expect(fd.has("defaultPurchaseTaxId")).toBe(true)
    expect(fd.get("defaultPurchaseTaxId")).toBe("")
    expect(fd.get("defaultDppPercent")).toBe("50")
    unmount(root, container)
  })

  it("gagal server: pesan fail-closed tampil verbatim, bukan fallback statis", async () => {
    vi.mocked(updateItem).mockResolvedValue({
      success: false,
      error: "Kode pajak default penjualan tidak ditemukan atau nonaktif di master pajak (vonis Q-ITX-1 Putusan 3). Pilih kode pajak aktif atau kosongkan.",
    })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <ItemForm {...baseProps} item={editItem} />)
    await submitForm(container)
    expect(showError).toHaveBeenCalledWith("Kode pajak default penjualan tidak ditemukan atau nonaktif di master pajak (vonis Q-ITX-1 Putusan 3). Pilih kode pajak aktif atau kosongkan.")
    expect(showSuccess).not.toHaveBeenCalled()
    unmount(root, container)
  })

  it("persen di luar 0–100 dikirim apa adanya — UI tidak men-clamp, server menolak", async () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <ItemForm {...baseProps} item={editItem} />)
    setFieldValue(container.querySelector<HTMLInputElement>("#defaultDppPercent")!, "101")
    await submitForm(container)
    const fd = vi.mocked(updateItem).mock.calls[0][1] as FormData
    expect(fd.get("defaultDppPercent")).toBe("101")
    unmount(root, container)
  })
})
