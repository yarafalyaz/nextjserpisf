// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { SettingsEditForm } from "../settings-edit-form"
import { updateSystemSettings } from "@/actions/settings.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/settings.actions", () => ({ updateSystemSettings: vi.fn() }))

const updateMock = vi.mocked(updateSystemSettings)

function mount(settings: Record<string, unknown>) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(<SettingsEditForm settings={settings} accounts={[]} section="company" />)
  })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

describe("SettingsEditForm — field PKP perusahaan (F-2026-10-25-015-V)", () => {
  it("render 3 field PKP dengan nilai tersimpan + label terikat", () => {
    const { container, root } = mount({
      companyPkpStatus: "pkp",
      companyPkpEffectiveFrom: "2025-01-01",
      companyPkpSource: "SPPKP 001/2025",
    })
    const status = container.querySelector<HTMLInputElement>('input[name="companyPkpStatus"]')!
    expect(status.value).toBe("pkp")
    const from = container.querySelector<HTMLInputElement>('input[name="companyPkpEffectiveFrom"]')!
    expect(from.value).toBe("2025-01-01")
    const source = container.querySelector<HTMLInputElement>("#companyPkpSource")!
    expect(source.value).toBe("SPPKP 001/2025")
    const labels = Array.from(container.querySelectorAll("label")).map((l) => l.textContent)
    expect(labels).toEqual(
      expect.arrayContaining(["Status PKP Perusahaan", "Tanggal Mulai Kewajiban PKP", "Sumber Status PKP"]),
    )
    expect(container.querySelector('label[for="companyPkpStatus"]')).not.toBeNull()
    expect(container.querySelector('label[for="companyPkpEffectiveFrom-trigger"]')).not.toBeNull()
    expect(container.querySelector('label[for="companyPkpSource"]')).not.toBeNull()
    unmount(root, container)
  })

  it("default status belum ditetapkan bila kosong", () => {
    const { container, root } = mount({})
    const status = container.querySelector<HTMLInputElement>('input[name="companyPkpStatus"]')!
    expect(status.value).toBe("unknown")
    unmount(root, container)
  })

  it("submit mengirim 3 field PKP lewat updateSystemSettings existing", async () => {
    updateMock.mockResolvedValue(undefined as never)
    const { container, root } = mount({
      companyPkpStatus: "pkp",
      companyPkpEffectiveFrom: "2025-01-01",
      companyPkpSource: "SPPKP 001/2025",
    })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(updateMock).toHaveBeenCalledTimes(1)
    const formData = updateMock.mock.calls[0][0] as FormData
    expect(formData.get("companyPkpStatus")).toBe("pkp")
    expect(formData.get("companyPkpEffectiveFrom")).toBe("2025-01-01")
    expect(formData.get("companyPkpSource")).toBe("SPPKP 001/2025")
    expect(vi.mocked(showSuccess)).toHaveBeenCalledWith("Pengaturan berhasil disimpan")
    unmount(root, container)
  })

  it("error server tampil verbatim (pkp tanpa tanggal)", async () => {
    const pesan = "Status PKP perusahaan = PKP wajib disertai tanggal mulai kewajiban PKP. Isi tanggal mulai kewajiban (bukan tanggal SPPKP) sebelum menyimpan."
    updateMock.mockRejectedValue(new Error(pesan))
    const { container, root } = mount({ companyPkpStatus: "pkp" })
    const form = container.querySelector("form")!
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(vi.mocked(showError)).toHaveBeenCalledWith(pesan)
    unmount(root, container)
  })
})
