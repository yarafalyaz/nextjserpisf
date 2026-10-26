// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const createAction = vi.fn(
  async (_fd: FormData): Promise<{ success: boolean; error?: string; id?: number }> => ({
    success: true,
    id: 7,
  }),
)
const showError = vi.fn()
const showSuccess = vi.fn()
const push = vi.fn()

vi.mock("@/actions/hrm.actions", () => ({
  createAttendanceCorrection: (fd: FormData) => createAction(fd),
  approveAttendanceCorrection: vi.fn(),
  rejectAttendanceCorrection: vi.fn(),
  cancelAttendanceCorrection: vi.fn(),
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

import { AttendanceCorrectionForm } from "../attendance-correction-form"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => act(() => r.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})
beforeEach(() => {
  createAction.mockResolvedValue({ success: true, id: 7 })
})

function renderForm() {
  const el = document.createElement("div")
  document.body.appendChild(el)
  const root = createRoot(el)
  roots.push(root)
  act(() =>
    root.render(
      <AttendanceCorrectionForm
        employees={[{ id: 10, name: "Budi Santoso", employeeNo: "EMP-010" }]}
      />,
    ),
  )
  return el.querySelector("form")!
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("AttendanceCorrectionForm F-2026-10-25-010-S", () => {
  it("field FormData lengkap terkirim; sukses navigasi ke daftar koreksi", async () => {
    const form = renderForm()
    await submit(form)
    expect(createAction).toHaveBeenCalledTimes(1)
    const fd = createAction.mock.calls[0][0]
    expect(fd.get("employeeId")).not.toBeNull()
    expect(fd.get("reason")).not.toBeNull()
    expect(showSuccess).toHaveBeenCalledWith("Pengajuan koreksi absensi terkirim")
    expect(push).toHaveBeenCalledWith("/sdm/absensi/koreksi")
  })

  it("error server tampil verbatim", async () => {
    createAction.mockResolvedValue({
      success: false,
      error:
        "Tanggal koreksi di luar jendela pengajuan (paling awal tanggal 1 bulan lalu, paling akhir hari ini)",
    })
    const form = renderForm()
    await submit(form)
    expect(showError).toHaveBeenCalledWith(
      "Tanggal koreksi di luar jendela pengajuan (paling awal tanggal 1 bulan lalu, paling akhir hari ini)",
    )
    expect(push).not.toHaveBeenCalled()
  })

  it("label terikat id: karyawan, status, alasan wajib", () => {
    renderForm()
    for (const id of ["correctionEmployee", "correctionStatus", "correctionReason"]) {
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull()
      expect(document.getElementById(id)).not.toBeNull()
    }
    expect(document.getElementById("correctionReason")?.hasAttribute("required")).toBe(true)
  })
})
