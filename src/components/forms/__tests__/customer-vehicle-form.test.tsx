// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { CustomerVehicleForm } from "../customer-vehicle-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
// Radix Popover (Combobox) pakai ResizeObserver; jsdom tidak punya.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

vi.mock("@/actions/vehicle.actions", () => ({ createCustomerVehicle: vi.fn(), updateCustomerVehicle: vi.fn() }))

const brands = [{ id: 1, name: "Toyota", models: [{ id: 2, name: "Fortuner", variants: [{ id: 3, name: "2.4 VRZ" }] }] }]
const customers = [{ id: 9, name: "Budi" }]

describe("CustomerVehicleForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, varian wajib aria-required, 4 bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerVehicleForm brands={brands} customers={customers} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah kendaraan pelanggan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(container.querySelector("#variantId")!.getAttribute("aria-required")).toBe("true")
      expect(decorativeStars(form).length).toBe(4)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Pelanggan *", "Merek Kendaraan *", "Model Kendaraan *", "Varian *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah kendaraan pelanggan", () => {
    withContainer((container) => {
      const root = mountInto(container, <CustomerVehicleForm customerId={9} brands={brands} vehicle={{ id: 5, vehicleId: 3, brandId: 1, modelId: 2, variantId: 3, plateNumber: "B 1 AA", year: 2022, color: "Hitam", chassisNumber: "", engineNumber: "", isActive: true, notes: "" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah kendaraan pelanggan")
      unmount(root, container)
    })
  })
})
