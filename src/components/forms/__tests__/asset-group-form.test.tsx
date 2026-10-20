// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetGroupForm } from "../asset-group-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  createAssetGroup: vi.fn().mockResolvedValue({ success: true }),
  updateAssetGroup: vi.fn().mockResolvedValue({ success: true }),
}))

describe("AssetGroupForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; name required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetGroupForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah grup aset")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah grup aset", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetGroupForm group={{ id: 3, name: "Kendaraan Operasional" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah grup aset")
      unmount(root, container)
    })
  })
})
