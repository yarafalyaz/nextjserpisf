// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { VehicleBrandForm } from "../vehicle-brand-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/vehicle.actions", () => ({ createVehicleBrand: vi.fn(), updateVehicleBrand: vi.fn() }))

describe("VehicleBrandForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleBrandForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah merek kendaraan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Merek *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah merek kendaraan", () => {
    withContainer((container) => {
      const root = mountInto(container, <VehicleBrandForm brand={{ id: 3, name: "Toyota" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah merek kendaraan")
      unmount(root, container)
    })
  })
})
