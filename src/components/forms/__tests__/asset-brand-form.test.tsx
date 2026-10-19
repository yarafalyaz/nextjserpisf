// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AssetBrandForm } from "../asset-brand-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)

describe("AssetBrandForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetBrandForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah merek aset")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama Merek *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah merek aset", () => {
    withContainer((container) => {
      const root = mountInto(container, <AssetBrandForm brand={{ id: 3, name: "Dell" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah merek aset")
      unmount(root, container)
    })
  })
})
