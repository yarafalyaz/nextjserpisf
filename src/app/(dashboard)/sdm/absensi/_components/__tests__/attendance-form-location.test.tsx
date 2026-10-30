// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const createAction = vi.fn(
  async (_fd: FormData): Promise<{ success: boolean; error?: string; id?: number }> => ({
    success: true,
    id: 7,
  }),
)
const updateAction = vi.fn(
  async (_id: number, _fd: FormData): Promise<{ success: boolean; error?: string }> => ({
    success: true,
  }),
)
const showError = vi.fn()
const showSuccess = vi.fn()
const push = vi.fn()

vi.mock("@/actions/hrm.actions", () => ({
  createAttendance: (fd: FormData) => createAction(fd),
  updateAttendance: (id: number, fd: FormData) => updateAction(id, fd),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => showError(...(args as [])),
  showSuccess: (...args: unknown[]) => showSuccess(...(args as [])),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push, back: vi.fn() }),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { AttendanceForm, type AttendanceFormItem } from "../attendance-forms"

const ITEM: AttendanceFormItem = {
  id: 7,
  employeeId: 10,
  date: "2026-08-17",
  checkIn: "08:05",
  checkOut: "17:10",
  status: "present",
  notes: "",
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => act(() => r.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
  Reflect.deleteProperty(window.navigator, "geolocation")
})
beforeEach(() => {
  createAction.mockResolvedValue({ success: true, id: 7 })
  updateAction.mockResolvedValue({ success: true })
})

function mockGeolocationSuccess() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) =>
        success({
          coords: { latitude: -6.2, longitude: 106.816666 },
        } as GeolocationPosition),
    },
  })
}

function mockGeolocationDenied() {
  Object.defineProperty(window.navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        _success: PositionCallback,
        error?: PositionErrorCallback | null,
      ) => error?.({ message: "User denied Geolocation" } as GeolocationPositionError),
    },
  })
}

function renderForm(item: AttendanceFormItem = ITEM) {
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  act(() =>
    root.render(
      <AttendanceForm
        employees={[{ id: 10, name: "Budi Santoso", employeeNo: "EMP-010" }]}
        item={item}
      />,
    ),
  )
  return el.querySelector("form")!
}

async function clickLocationButton(form: HTMLFormElement) {
  const button = Array.from(form.querySelectorAll("button")).find(
    (b) => b.textContent === "Gunakan lokasi saat ini",
  )
  expect(button).toBeDefined()
  await act(async () => {
    button!.click()
  })
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("AttendanceForm tangkapan lokasi GPS", () => {
  it("koordinat tertangkap ditampilkan dan disuntik untuk check-in dan check-out", async () => {
    mockGeolocationSuccess()
    const form = renderForm()

    await clickLocationButton(form)
    expect(form.textContent).toContain("Lokasi: -6.200000, 106.816666")

    await submit(form)
    expect(updateAction).toHaveBeenCalledTimes(1)
    const fd = updateAction.mock.calls[0][1]
    expect(fd.get("checkInLatitude")).toBe("-6.2")
    expect(fd.get("checkInLongitude")).toBe("106.816666")
    expect(fd.get("checkOutLatitude")).toBe("-6.2")
    expect(fd.get("checkOutLongitude")).toBe("106.816666")
  })

  it("koordinat pasangan jam kosong tidak dikirim", async () => {
    mockGeolocationSuccess()
    const form = renderForm({ ...ITEM, checkOut: "" })

    await clickLocationButton(form)
    await submit(form)

    const fd = updateAction.mock.calls[0][1]
    expect(fd.get("checkInLatitude")).toBe("-6.2")
    expect(fd.get("checkOutLatitude")).toBeNull()
    expect(fd.get("checkOutLongitude")).toBeNull()
  })

  it("geolocation ditolak: showError tampil dan submit tetap jalan tanpa koordinat", async () => {
    mockGeolocationDenied()
    const form = renderForm()

    await clickLocationButton(form)
    expect(showError).toHaveBeenCalledWith("Gagal mengambil lokasi: User denied Geolocation")

    await submit(form)
    expect(updateAction).toHaveBeenCalledTimes(1)
    const fd = updateAction.mock.calls[0][1]
    expect(fd.get("checkInLatitude")).toBeNull()
    expect(fd.get("checkOutLongitude")).toBeNull()
  })

  it("tanpa tangkapan lokasi form terkirim persis seperti sebelumnya", async () => {
    const form = renderForm()

    await submit(form)

    expect(updateAction).toHaveBeenCalledTimes(1)
    const fd = updateAction.mock.calls[0][1]
    expect(fd.get("checkInLatitude")).toBeNull()
    expect(fd.get("checkInLongitude")).toBeNull()
    expect(fd.get("checkOutLatitude")).toBeNull()
    expect(fd.get("checkOutLongitude")).toBeNull()
  })
})
