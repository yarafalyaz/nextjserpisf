// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver:
    globalThis.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
})

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { StorageForm } from "../storage-form"
import { SettingsEditForm } from "@/app/(dashboard)/pengaturan/ubah/_components/settings-edit-form"
import { updateStorageSettings, updateSystemSettings } from "@/actions/settings.actions"
import { showError, showSuccess } from "@/lib/utils/toast"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/settings.actions", () => ({
  updateStorageSettings: vi.fn(),
  updateSystemSettings: vi.fn(),
}))

const updateStorageMock = vi.mocked(updateStorageSettings)
const updateSystemMock = vi.mocked(updateSystemSettings)

beforeEach(() => {
  vi.clearAllMocks()
})

function mount(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe("StorageForm & SettingsEditForm action result error handling", () => {
  it("StorageForm renders FormActions buttons with min-h-11 md:min-h-9 w-full md:w-auto and shows { success: false, error }", async () => {
    updateStorageMock.mockResolvedValue({
      success: false,
      error: "Validasi gagal: r2AccountId: ID Akun Cloudflare R2 harus berupa 16-64 karakter alfanumerik",
    })

    const { container, unmount } = mount(
      <StorageForm
        driver="r2"
        fallbackLocal={true}
        assetBaseUrl=""
        r2AccountId=""
        r2AccessKeyId=""
        r2Bucket=""
        hasSecret={false}
      />,
    )

    const submitBtn = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Batal",
    )!
    expect(submitBtn.className).toContain("min-h-11")
    expect(submitBtn.className).toContain("md:min-h-9")
    expect(submitBtn.className).toContain("w-full")
    expect(submitBtn.className).toContain("md:w-auto")
    expect(cancelBtn.className).toContain("min-h-11")
    expect(cancelBtn.className).toContain("md:min-h-9")
    expect(cancelBtn.className).toContain("w-full")
    expect(cancelBtn.className).toContain("md:w-auto")

    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(showError).toHaveBeenCalledWith(
      "Validasi gagal: r2AccountId: ID Akun Cloudflare R2 harus berupa 16-64 karakter alfanumerik",
    )
    expect(showSuccess).not.toHaveBeenCalled()
    unmount()
  })

  it("SettingsEditForm displays returned { success: false, error } without calling showSuccess", async () => {
    const msg =
      "Status PKP perusahaan = PKP wajib disertai tanggal mulai kewajiban PKP. Isi tanggal mulai kewajiban (bukan tanggal SPPKP) sebelum menyimpan."
    updateSystemMock.mockResolvedValue({ success: false, error: msg })

    const { container, unmount } = mount(
      <SettingsEditForm settings={{ companyPkpStatus: "pkp" }} accounts={[]} section="company" />,
    )

    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })

    expect(showError).toHaveBeenCalledWith(msg)
    expect(showSuccess).not.toHaveBeenCalled()
    unmount()
  })
})
