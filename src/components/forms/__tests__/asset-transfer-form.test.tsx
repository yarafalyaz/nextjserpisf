// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetTransferForm } from "../asset-transfer-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/asset.actions", () => ({
  createAssetTransfer: vi.fn().mockResolvedValue({ success: true }),
  updateAssetTransfer: vi.fn().mockResolvedValue({ success: true }),
}))

const assets = [{ id: 7, code: "AST-001", name: "Komputer", location: "Kantor Pusat" }]

describe("AssetTransferForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; combobox aset aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetTransferForm assets={assets} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah transfer aset")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("[role='combobox']")!.getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#toLocation")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Aset *", "Ke Lokasi *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah transfer aset", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <AssetTransferForm assets={assets} transfer={{ id: 3, assetId: 7, transferDate: "2026-10-20", toLocation: "Gudang" }} />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah transfer aset")
      unmount(root, container)
    })
  })
})
