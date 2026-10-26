// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  scheduleAction: vi.fn(
    async (
      _id: number,
      _formData: FormData,
    ): Promise<{ success: boolean; error?: string }> => ({ success: true }),
  ),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))
const { scheduleAction, showError, showSuccess } = mocks

vi.mock("@/actions/vehicle.actions", () => ({
  updateCustomerVehicleServiceSchedule: (id: number, formData: FormData) =>
    mocks.scheduleAction(id, formData),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: mocks.showError,
  showSuccess: mocks.showSuccess,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { VehicleServiceScheduleForm } from "../vehicle-service-schedule-form"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})
beforeEach(() => {
  scheduleAction.mockResolvedValue({ success: true })
})

function render(canEdit = true) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <VehicleServiceScheduleForm
        vehicleId={7}
        nextServiceDate={new Date(Date.UTC(2026, 10, 5))}
        nextServiceKm={52000}
        nextServiceNote="ganti oli"
        lastOdometerKm={51000}
        canEdit={canEdit}
      />,
    )
  })
  roots.push(root)
  return container
}

describe("VehicleServiceScheduleForm F-2026-10-25-021-S", () => {
  it("jadwal tersimpan tampil verbatim; submit kirim field kontrak + sukses toast", async () => {
    const container = render()
    const text = container.textContent ?? ""
    expect(text).toContain("Jadwal Servis Berikutnya")
    expect(text).toContain("52.000 km")
    expect(text).toContain("51.000 km")
    expect(text).toContain("ganti oli")

    const form = container.querySelector("form")
    expect(form).toBeTruthy()
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(scheduleAction).toHaveBeenCalledTimes(1)
    const [id, formData] = scheduleAction.mock.calls[0] as unknown as [number, FormData]
    expect(id).toBe(7)
    expect(formData.get("nextServiceDate")).toBe("2026-11-05")
    expect(formData.get("nextServiceKm")).toBe("52000")
    expect(formData.get("nextServiceNote")).toBe("ganti oli")
    expect(showSuccess).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it("error server tampil verbatim (penolakan km <= odometer terakhir, AC-SV-F3)", async () => {
    scheduleAction.mockResolvedValue({
      success: false,
      error:
        "Km servis berikutnya (50.000) harus lebih besar dari odometer terakhir tercatat (51.000 km). Periksa kembali jadwal yang dicatat.",
    })
    const container = render()
    const form = container.querySelector("form")
    await act(async () => {
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(showError).toHaveBeenCalledWith(
      "Km servis berikutnya (50.000) harus lebih besar dari odometer terakhir tercatat (51.000 km). Periksa kembali jadwal yang dicatat.",
    )
    expect(showSuccess).not.toHaveBeenCalled()
  })

  it("tanpa izin edit: form tidak dirender, penjelasan tampil (server tetap menolak)", () => {
    const container = render(false)
    expect(container.querySelector("form")).toBeNull()
    expect(container.textContent ?? "").toContain(
      "Anda tidak memiliki izin mencatat jadwal servis kendaraan ini.",
    )
    expect(container.textContent ?? "").toContain("52.000 km")
  })
})
