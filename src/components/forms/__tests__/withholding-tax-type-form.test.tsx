// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { WithholdingTaxTypeForm } from "../withholding-tax-type-form"
import {
  mountInto, unmount, withContainer, assertCodeNameA11yAdd,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/withholding-tax.actions", () => ({ createWithholdingTaxType: vi.fn(), updateWithholdingTaxType: vi.fn() }))

describe("WithholdingTaxTypeForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <WithholdingTaxTypeForm accounts={[]} />)
      assertCodeNameA11yAdd(container.querySelector("form")!, container, "Formulir tambah jenis pemotongan PPh")
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah jenis pemotongan PPh + kode/nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <WithholdingTaxTypeForm
          accounts={[]}
          taxType={{ id: 3, code: "PPH23", name: "PPh 23 — Jasa", rate: 2, liabilityAccountId: null, receivableAccountId: null, isActive: true }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah jenis pemotongan PPh")
      expect(container.querySelector<HTMLInputElement>("#code")!.value).toBe("PPH23")
      expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("PPh 23 — Jasa")
      unmount(root, container)
    })
  })
})
