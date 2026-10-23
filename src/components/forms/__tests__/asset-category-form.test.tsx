// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetCategoryForm } from "../asset-category-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/asset.actions", () => ({
  createAssetCategory: vi.fn().mockResolvedValue({ success: true }),
  updateAssetCategory: vi.fn().mockResolvedValue({ success: true }),
}))

describe("AssetCategoryForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; name required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetCategoryForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah kategori aset")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Kategori *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah kategori aset", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetCategoryForm category={{ id: 3, name: "Kendaraan" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah kategori aset")
      unmount(root, container)
    })
  })

  it("field fiskal F-062 ter-render berlabel: kelompok, jenis tercantum, penetapan DJP", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetCategoryForm category={{ id: 3, name: "Kendaraan", taxGroupCode: "GROUP_2", taxTypeListed: true, taxDjpDetermination: true }} />)
      const form = container.querySelector("form")!
      expect(form.querySelector("#taxGroupCode")).not.toBeNull()
      expect(form.querySelector("#taxTypeListed")).not.toBeNull()
      const djp = form.querySelector<HTMLInputElement>("#taxDjpDetermination")!
      expect(djp.type).toBe("checkbox")
      expect(djp.checked).toBe(true)
      expect(labelTexts(form)).toEqual(expect.arrayContaining([
        "Kelompok Fiskal",
        "Jenis Harta di Lampiran PMK 72/2023",
        "Ada penetapan DJP untuk jenis ini",
      ]))
      unmount(root, container)
    })
  })
})
