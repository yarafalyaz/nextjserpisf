// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { LeadForm } from "../lead-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/master.actions", () => ({ createLead: vi.fn(), updateLead: vi.fn() }))

describe("LeadForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, nama wajib + bintang dekoratif, action bar stack mobile", () => {
    withContainer((container) => {
      const root = mountInto(container, <LeadForm />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah prospek")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(form.className).toContain("p-4")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Nama *"]))
      const bar = form.lastElementChild!
      expect(bar.className).toContain("flex-col-reverse")
      expect(bar.querySelectorAll("button.w-full").length).toBe(2)
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah prospek + nama terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <LeadForm lead={{ id: 3, name: "Lead A", email: null, phone: null, company: null, contactName: null, position: null, industry: null, estimatedValue: null, expectedCloseDate: null, address: null, source: null, notes: null, status: "new", assignedTo: null }} />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah prospek")
      expect(container.querySelector<HTMLInputElement>("#name")?.value).toBe("Lead A")
      unmount(root, container)
    })
  })
})
