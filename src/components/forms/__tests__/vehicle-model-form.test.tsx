// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { VehicleModelForm } from "../vehicle-model-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/vehicle.actions", () => ({ createVehicleModel: vi.fn(), updateVehicleModel: vi.fn() }))

const brands = [{ id: 1, name: "Toyota" }]

describe("VehicleModelForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, combobox wajib aria-required, 2 bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleModelForm brands={brands} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah model kendaraan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Merek Kendaraan *", "Nama Model *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah model kendaraan + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleModelForm brands={brands} model={{ id: 3, name: "Avanza", vehicleBrandId: 1 }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah model kendaraan")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Avanza")
      unmount(root, container)
    })
  })
})
