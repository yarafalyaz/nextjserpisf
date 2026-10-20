// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { AccountForm } from "../account-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/master.actions", () => ({ createAccount: vi.fn(), updateAccount: vi.fn() }))

const accounts = [{ id: 1, code: "ACC-001", name: "Kas" }]

describe("AccountForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <AccountForm accounts={accounts} generatedCode="ACC-002" />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah akun")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Kode Akun *", "Nama Akun *", "Tipe *"]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah akun + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <AccountForm accounts={accounts} account={{ id: 3, code: "ACC-001", name: "Kas", type: "ASSET" }} />,
      )
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah akun")
      expect(container.querySelector<HTMLInputElement>("#name")!.value).toBe("Kas")
      unmount(root, container)
    })
  })
})
