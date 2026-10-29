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
vi.mock("@/actions/master.actions", () => ({
  createBrand: (...a: unknown[]) => createMock(...(a as [])),
  updateBrand: (...a: unknown[]) => updateMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("@/components/payroll/__tests__/button-mock"))
vi.mock("@/components/ui/quick-add-select", () => ({ QuickAddSelect: () => null }))
vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))

import { mount, act } from "@/components/payroll/__tests__/mount"
import { BrandForm } from "../brand-form"

async function submit(container: HTMLElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
}

describe("BrandForm — gerbang sukses palsu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createMock.mockResolvedValue({ success: true })
    updateMock.mockResolvedValue({ success: true })
  })

  it("create {success:false} → showError, tanpa showSuccess/push", async () => {
    createMock.mockResolvedValue({ success: false, error: "Merek sudah ada" })
    const { container, root } = mount(<BrandForm categories={[]} />)
    await submit(container)
    expect(showErrorMock).toHaveBeenCalledWith("Merek sudah ada")
    expect(showSuccessMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("update {success:false} → showError, tanpa showSuccess/push", async () => {
    updateMock.mockResolvedValue({ success: false, error: "Gagal ubah merek" })
    const { container, root } = mount(
      <BrandForm categories={[]} brand={{ id: 7, name: "Lama", description: null }} />,
    )
    await submit(container)
    expect(showErrorMock).toHaveBeenCalledWith("Gagal ubah merek")
    expect(showSuccessMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("create {success:true} → showSuccess + push", async () => {
    const { container, root } = mount(<BrandForm categories={[]} />)
    await submit(container)
    expect(showSuccessMock).toHaveBeenCalledWith("Merek berhasil ditambahkan")
    expect(pushMock).toHaveBeenCalledWith("/master/merek")
    root.unmount()
  })
})
