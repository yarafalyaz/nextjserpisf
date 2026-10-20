// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { TicketForm } from "../ticket-form"
import { mountInto, unmount, withContainer, decorativeStars, labelTexts } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/actions/crm.actions", () => ({ createTicket: vi.fn(), updateTicket: vi.fn() }))
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

describe("TicketForm — a11y wiring", () => {
  it("tambah: aria-label + aria-busy false, subjek wajib + 2 bintang dekoratif, action bar stack mobile", () => {
    withContainer((container) => {
      const root = mountInto(container, <TicketForm customers={[]} users={[]} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah tiket")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(form.className).toContain("p-4")
      expect(container.querySelector("#subject")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(2)
      expect(labelTexts(form)).toEqual(expect.arrayContaining(["Subjek *", "Prioritas *"]))
      // priority schema optional (optionalString) + form default "medium": tidak dipaksa required (konsisten petty-cash nominal).
      expect(container.querySelector("#priority")!.getAttribute("aria-required")).toBeNull()
      const bar = form.lastElementChild!
      expect(bar.className).toContain("flex-col-reverse")
      expect(bar.querySelectorAll("button.w-full").length).toBe(2)
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah tiket + subjek terisi", () => {
    withContainer((container) => {
      const root = mountInto(container, (
        <TicketForm
          customers={[]}
          users={[]}
          ticket={{ id: 3, subject: "Mesin mati", priority: "high", status: "open", ticketNumber: "TKT-001" }}
        />
      ))
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah tiket")
      expect(container.querySelector<HTMLInputElement>("#subject")?.value).toBe("Mesin mati")
      unmount(root, container)
    })
  })
})
