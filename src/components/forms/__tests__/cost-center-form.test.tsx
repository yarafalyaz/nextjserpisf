// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { CostCenterForm } from "../cost-center-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

// Radix Checkbox (shadcn) pakai ResizeObserver via @radix-ui/react-use-size; jsdom tidak punya.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver
vi.mock("@/actions/finance.actions", () => ({
  createCostCenter: vi.fn().mockResolvedValue({ success: true }),
  updateCostCenter: vi.fn().mockResolvedValue({ success: true }),
}))

const pusatBiaya = { id: 3, code: "CC-01", name: "Utama" }

describe("CostCenterForm — a11y wiring", () => {
  it("tambah: label form, busy mati, code+name required, 2 bintang tersembunyi dari AT", () => {
    withContainer((container) => {
      const root = mountInto(container, <CostCenterForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pusat biaya")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector<HTMLInputElement>("#code")?.required).toBe(true)
      expect(container.querySelector<HTMLInputElement>("#name")?.required).toBe(true)
      expect(decorativeStars(form)).toHaveLength(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode *", "Nama *"]))
      unmount(root, container)
    })
  })

  it("ubah: label form berubah dan nilai code/name terisi dari record", () => {
    withContainer((container) => {
      const root = mountInto(container, <CostCenterForm costCenter={pusatBiaya} />)
      expect(container.querySelector("form")?.getAttribute("aria-label")).toBe("Formulir ubah pusat biaya")
      expect(container.querySelector<HTMLInputElement>("#code")?.value).toBe("CC-01")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Utama")
      unmount(root, container)
    })
  })
})
