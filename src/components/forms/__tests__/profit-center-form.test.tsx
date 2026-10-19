// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { ProfitCenterForm } from "../profit-center-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/finance.actions", () => ({
  createProfitCenter: vi.fn().mockResolvedValue({ success: true }),
  updateProfitCenter: vi.fn().mockResolvedValue({ success: true }),
}))

describe("ProfitCenterForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <ProfitCenterForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pusat laba")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#code")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode *", "Nama *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pusat laba", () => {
    withContainer((container) => {
      const root = mountInto(container, <ProfitCenterForm center={{ id: 3, code: "PC-01", name: "Utama" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pusat laba")
      unmount(root, container)
    })
  })
})
