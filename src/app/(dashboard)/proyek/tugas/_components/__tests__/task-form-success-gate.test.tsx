// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

const pushMock = vi.fn()
const refreshMock = vi.fn()
const { showSuccessMock, showErrorMock, createMock, updateMock } = vi.hoisted(() => ({
  showSuccessMock: vi.fn(),
  showErrorMock: vi.fn(),
  createMock: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })),
  updateMock: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, back: vi.fn() }),
}))
vi.mock("@/actions/project.actions", () => ({
  createTask: (...a: unknown[]) => createMock(...(a as [])),
  updateTask: (...a: unknown[]) => updateMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("@/components/payroll/__tests__/button-mock"))
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ id, name }: { id?: string; name?: string }) => <input id={id} name={name} readOnly />,
}))
vi.mock("@/components/ui/quick-add-select", () => ({ QuickAddSelect: () => null }))
vi.mock("@/components/ui/date-picker", () => ({ AppDatePicker: () => null }))
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import { TaskForm } from "../task-form"

const projects = [{ id: 1, name: "Proyek A" }]
const employees = [{ id: 2, name: "Karyawan A" }]

async function submit(container: HTMLElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
}

describe("TaskForm — gerbang sukses palsu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createMock.mockResolvedValue({ success: true })
    updateMock.mockResolvedValue({ success: true })
  })

  it("create {success:false} → showError, tanpa showSuccess/push", async () => {
    createMock.mockResolvedValue({ success: false, error: "Proyek tidak ditemukan" })
    const { container, root } = mount(<TaskForm projects={projects} employees={employees} />)
    await submit(container)
    expect(showErrorMock).toHaveBeenCalledWith("Proyek tidak ditemukan")
    expect(showSuccessMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("update {success:false} → showError, tanpa showSuccess/push", async () => {
    updateMock.mockResolvedValue({ success: false, error: "Tugas terkunci" })
    const task = { id: 9, projectId: 1, name: "Tugas Lama", status: "pending" }
    const { container, root } = mount(<TaskForm projects={projects} employees={employees} task={task} />)
    await submit(container)
    expect(showErrorMock).toHaveBeenCalledWith("Tugas terkunci")
    expect(showSuccessMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("create {success:true} → showSuccess + push", async () => {
    const { container, root } = mount(<TaskForm projects={projects} employees={employees} />)
    await submit(container)
    expect(showSuccessMock).toHaveBeenCalledWith("Tugas berhasil ditambahkan")
    expect(pushMock).toHaveBeenCalledWith("/proyek/tugas")
    root.unmount()
  })
})
