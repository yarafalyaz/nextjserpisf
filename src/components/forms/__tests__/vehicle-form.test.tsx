// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { VehicleForm } from "../vehicle-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/vehicle.actions", () => ({ createVehicle: vi.fn(), updateVehicle: vi.fn() }))

const brands = [{ id: 1, name: "Toyota" }]
const models = [{ id: 2, name: "Fortuner", vehicleBrandId: 1 }]
const variants = [{ id: 3, name: "2.4 VRZ", vehicleModelId: 2, drivetrain: null, transmission: null }]

describe("VehicleForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, combobox varian wajib aria-required, 1 bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleForm brands={brands} models={models} variants={variants} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah kendaraan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Tipe / Varian *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah kendaraan", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleForm brands={brands} models={models} variants={variants} vehicle={{ id: 3, variantId: 3 }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah kendaraan")
      unmount(root, container)
    })
  })
})
