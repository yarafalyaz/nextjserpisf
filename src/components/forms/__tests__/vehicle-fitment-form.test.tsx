// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { VehicleFitmentForm } from "../vehicle-fitment-form"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

vi.mock("@/actions/vehicle-fitment.actions", () => ({
  createVehicleFitment: vi.fn().mockResolvedValue({ success: true, id: 9 }),
  updateVehicleFitment: vi.fn().mockResolvedValue({ success: true, id: 9 }),
}))

vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

import { updateVehicleFitment } from "@/actions/vehicle-fitment.actions"

const rule = {
  id: 9,
  itemId: 5,
  vehicleBrandId: null,
  vehicleModelId: null,
  vehicleVariantId: null,
  yearFrom: null,
  yearTo: null,
  drivetrain: null,
  transmission: null,
  result: "compatible",
  source: null,
  notes: null,
  isActive: true,
}

async function submitEdit(isActiveChecked: boolean) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <VehicleFitmentForm
        items={[{ id: 5, sku: "SKU-1", name: "Barang Satu" }]}
        brands={[]}
        models={[]}
        variants={[]}
        rule={rule}
      />,
    )
  })
  const checkbox = container.querySelector<HTMLInputElement>("#isActive")!
  expect(checkbox.checked).toBe(true)
  if (!isActiveChecked) {
    act(() => {
      checkbox.click()
    })
    expect(checkbox.checked).toBe(false)
  }
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  act(() => root.unmount())
  container.remove()
}

describe("VehicleFitmentForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, combobox item wajib, 2 bintang dekoratif", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
      root.render(
        <VehicleFitmentForm
          items={[{ id: 5, sku: "SKU-1", name: "Barang Satu" }]}
          brands={[{ id: 1, name: "Toyota" }]}
          models={[{ id: 1, vehicleBrandId: 1, name: "Avanza" }]}
          variants={[{ id: 1, vehicleModelId: 1, name: "1.3 G" }]}
        />,
      )
    })
    const form = container.querySelector("form")!
    expect(form.getAttribute("aria-label")).toBe("Formulir tambah aturan fitment")
    expect(form.getAttribute("aria-busy")).toBe("false")
    expect(container.querySelectorAll('[role="combobox"][aria-required="true"]').length).toBe(1)
    expect(form.querySelectorAll('span[aria-hidden="true"].text-destructive').length).toBe(2)
    const labels = Array.from(form.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(expect.arrayContaining(["Item / SKU *", "Hasil *"]))
    act(() => root.unmount())
    container.remove()
  })

  it("mode ubah: aria-label ubah aturan fitment", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
      root.render(
        <VehicleFitmentForm
          items={[{ id: 5, sku: "SKU-1", name: "Barang Satu" }]}
          brands={[]}
          models={[]}
          variants={[]}
          rule={rule}
        />,
      )
    })
    expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah aturan fitment")
    act(() => root.unmount())
    container.remove()
  })
})

describe("VehicleFitmentForm — isActive payload", () => {
  beforeEach(() => vi.clearAllMocks())

  it("uncheck Aktif mengirim isActive=false ke updateVehicleFitment", async () => {
    await submitEdit(false)
    expect(updateVehicleFitment).toHaveBeenCalledTimes(1)
    const fd = vi.mocked(updateVehicleFitment).mock.calls[0][1] as FormData
    expect(fd.get("isActive")).toBe("false")
  })

  it("Aktif tetap dicentang mengirim isActive=true", async () => {
    await submitEdit(true)
    expect(updateVehicleFitment).toHaveBeenCalledTimes(1)
    const fd = vi.mocked(updateVehicleFitment).mock.calls[0][1] as FormData
    expect(fd.get("isActive")).toBe("true")
  })
})
