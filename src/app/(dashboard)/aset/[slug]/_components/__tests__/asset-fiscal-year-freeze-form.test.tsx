// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act } from "react"
import { AssetFiscalYearFreezeForm } from "../asset-fiscal-year-freeze-form"
import { mountInto, unmount, withContainer } from "@/components/forms/__tests__/form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("@/components/forms/__tests__/form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  generateAssetFiscalYearRows: vi.fn(),
}))

import { generateAssetFiscalYearRows } from "@/actions/asset.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

function openForm(container: HTMLElement) {
  const btn = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Bekukan Tahun Fiskal"))!
  act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })) })
  return container.querySelector("form")!
}

async function submitForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("AssetFiscalYearFreezeForm — bekukan tahun fiskal F-109-V", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tombol tampil; form terbuka berlabel dengan field berpasangan saldo pembuka", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetFiscalYearFreezeForm assetId={7} defaultThroughYear={2026} />)
      expect(container.textContent).toContain("Bekukan Tahun Fiskal")
      const form = openForm(container)
      expect(form.getAttribute("aria-label")).toBe("Formulir bekukan tahun fiskal")
      expect(form.querySelector<HTMLInputElement>("#fiscal-throughYear")!.value).toBe("2026")
      expect(form.querySelector("input[name='assetId']")!.getAttribute("value")).toBe("7")
      expect(form.querySelector("#fiscal-openingBalance")).not.toBeNull()
      expect(form.querySelector("#fiscal-openingYear")).not.toBeNull()
      unmount(root, container)
    })
  })

  it("submit sukses: FormData diteruskan apa adanya, toast angka server (created/existing)", async () => {
    vi.mocked(generateAssetFiscalYearRows).mockResolvedValue({ success: true, created: 2, existing: 1 })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <AssetFiscalYearFreezeForm assetId={7} defaultThroughYear={2026} />)
    await submitForm(openForm(container))
    expect(generateAssetFiscalYearRows).toHaveBeenCalledTimes(1)
    const fd = vi.mocked(generateAssetFiscalYearRows).mock.calls[0][0] as FormData
    expect(fd.get("assetId")).toBe("7")
    expect(fd.get("throughYear")).toBe("2026")
    expect(showSuccess).toHaveBeenCalledWith("Tahun fiskal terbekukan: 2 baris baru, 1 baris sudah ada")
    unmount(root, container)
  })

  it("submit gagal: error server tampil verbatim, bukan fallback karangan", async () => {
    vi.mocked(generateAssetFiscalYearRows).mockResolvedValue({ success: false, error: "Metode fiskal belum dipilih pada kategori aset ini." })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(container, <AssetFiscalYearFreezeForm assetId={7} defaultThroughYear={2026} />)
    await submitForm(openForm(container))
    expect(showError).toHaveBeenCalledWith("Metode fiskal belum dipilih pada kategori aset ini.")
    expect(showSuccess).not.toHaveBeenCalled()
    unmount(root, container)
  })
})
