// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

const pushMock = vi.fn()
const refreshMock = vi.fn()
const { showSuccessMock, showErrorMock, updateMock } = vi.hoisted(() => ({
  showSuccessMock: vi.fn(),
  showErrorMock: vi.fn(),
  updateMock: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock, back: vi.fn() }),
}))
vi.mock("@/actions/master.actions", () => ({
  updateItemCategory: (...a: unknown[]) => updateMock(...(a as [])),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: showSuccessMock, showError: showErrorMock }))
vi.mock("@/components/ui/button", async () => await import("@/components/payroll/__tests__/button-mock"))

import { mount, act } from "@/components/payroll/__tests__/mount"
import { ItemCategoryEditForm } from "../form"

const category = { id: 3, name: "Elektronik", description: null, parentId: null }

async function submit(container: HTMLElement) {
  const form = container.querySelector("form")!
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  await act(async () => {})
}

describe("ItemCategoryEditForm — gerbang sukses palsu", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMock.mockResolvedValue({ success: true })
  })

  it("update {success:false} → showError, tanpa showSuccess/push", async () => {
    updateMock.mockResolvedValue({ success: false, error: "Nama kategori sudah dipakai" })
    const { container, root } = mount(<ItemCategoryEditForm category={category} />)
    await submit(container)
    expect(showErrorMock).toHaveBeenCalledWith("Nama kategori sudah dipakai")
    expect(showSuccessMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    root.unmount()
  })

  it("update {success:true} → push (toast sukses bila form menampilkan)", async () => {
    const { container, root } = mount(<ItemCategoryEditForm category={category} />)
    await submit(container)
    expect(showErrorMock).not.toHaveBeenCalled()
    expect(pushMock).toHaveBeenCalledWith("/master/kategori-barang")
    root.unmount()
  })
})
