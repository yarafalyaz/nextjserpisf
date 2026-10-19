// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { CostCenterForm } from "../cost-center-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

// Radix Checkbox (shadcn) uses ResizeObserver via @radix-ui/react-use-size; jsdom lacks it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver
vi.mock("@/actions/finance.actions", () => ({
  createCostCenter: vi.fn().mockResolvedValue({ success: true }),
  updateCostCenter: vi.fn().mockResolvedValue({ success: true }),
}))

describe("CostCenterForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; input required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <CostCenterForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pusat biaya")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#code")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode *", "Nama *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pusat biaya", () => {
    withContainer((container) => {
      const root = mountInto(container, <CostCenterForm costCenter={{ id: 3, code: "CC-01", name: "Utama" }} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pusat biaya")
      unmount(root, container)
    })
  })
})
