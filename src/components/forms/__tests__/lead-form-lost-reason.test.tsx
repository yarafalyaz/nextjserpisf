// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

// Radix Popover/cmdk pakai ResizeObserver; jsdom tidak punya (pola repo).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}
import { act } from "react"
import { LeadForm } from "../lead-form"
import { mountInto, unmount, withContainer } from "./form-a11y-test-utils"
import { LEAD_LOST_REASON_CATEGORIES } from "@/lib/reports/lead-lost-reason"

const updateLeadMock = vi.fn()
const showErrorMock = vi.fn()

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: (...args: unknown[]) => showErrorMock(...args),
}))
vi.mock("@/actions/master.actions", () => ({
  createLead: vi.fn(),
  updateLead: (...args: unknown[]) => updateLeadMock(...args),
}))

const baseLead = {
  id: 3,
  name: "Lead A",
  email: null,
  phone: null,
  company: null,
  contactName: null,
  position: null,
  industry: null,
  estimatedValue: null,
  expectedCloseDate: null,
  address: null,
  source: null,
  notes: null,
  status: "new",
  assignedTo: null,
}

function pickOption(container: HTMLElement, triggerId: string, label: string) {
  act(() => {
    container.querySelector<HTMLElement>(`#${triggerId}`)!.click()
  })
  // Popover Radix render lewat Portal ke document.body, bukan container form.
  const option = Array.from(document.querySelectorAll('[role="option"]')).find(
    (el) => el.textContent?.includes(label),
  )
  expect(option, `opsi ${label}`).toBeTruthy()
  act(() => {
    ;(option as HTMLElement).click()
  })
}

function submit(container: HTMLElement) {
  act(() => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
}

describe("LeadForm — alasan kalah terstruktur F-2026-10-25-030-S", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateLeadMock.mockResolvedValue({ success: true })
  })

  it("status lost tanpa kategori -> galat verbatim server, updateLead tidak dipanggil", () => {
    withContainer((container) => {
      const root = mountInto(container, <LeadForm lead={baseLead} />)
      pickOption(container, "status", "Kalah")
      expect(container.querySelector("#lostReasonCategory")).not.toBeNull()
      expect(container.querySelector("#lostReasonText")).not.toBeNull()
      submit(container)
      expect(showErrorMock).toHaveBeenCalledWith(
        "Kategori alasan kalah wajib dipilih saat lead diubah menjadi kalah (lost).",
      )
      expect(updateLeadMock).not.toHaveBeenCalled()
      unmount(root, container)
    })
  })

  it("kategori dari kamus tunggal + teks bebas terkirim ke updateLead", async () => {
    let refs: { container: HTMLElement; root: ReturnType<typeof mountInto> } | undefined
    withContainer((container) => {
      const root = mountInto(container, <LeadForm lead={baseLead} />)
      refs = { container, root }
      pickOption(container, "status", "Kalah")
      // Opsi kategori persis kamus tunggal (label tampil dari objek sama).
      pickOption(container, "lostReasonCategory", LEAD_LOST_REASON_CATEGORIES[0].label)
      const text = container.querySelector<HTMLTextAreaElement>("#lostReasonText")!
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        )!.set!
        setter.call(text, "anggaran dipotong")
        text.dispatchEvent(new Event("input", { bubbles: true }))
      })
      submit(container)
    })
    await act(async () => {})
    expect(updateLeadMock).toHaveBeenCalledTimes(1)
    const formData = updateLeadMock.mock.calls[0][1] as FormData
    expect(formData.get("status")).toBe("lost")
    expect(formData.get("lostReasonCategory")).toBe("budget")
    expect(formData.get("lostReasonText")).toBe("anggaran dipotong")
    if (refs) unmount(refs.root, refs.container)
  })

  it("status non-lost: field alasan kalah absen, kategori tidak terkirim", async () => {
    let refs: { container: HTMLElement; root: ReturnType<typeof mountInto> } | undefined
    withContainer((container) => {
      const root = mountInto(container, <LeadForm lead={baseLead} />)
      refs = { container, root }
      expect(container.querySelector("#lostReasonCategory")).toBeNull()
      submit(container)
    })
    await act(async () => {})
    const formData = updateLeadMock.mock.calls[0][1] as FormData
    expect(formData.get("lostReasonCategory")).toBeNull()
    if (refs) unmount(refs.root, refs.container)
  })

  it("lead terminal lost: status tampil final, pemilih status + alasan kalah absen", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <LeadForm lead={{ ...baseLead, status: "lost" }} />,
      )
      expect(container.textContent).toContain("bersifat final")
      expect(container.querySelector("#lostReasonCategory")).toBeNull()
      // Pemilih status absen: combobox tersisa bukan pemilih status
      // (form edit tanpa users hanya combobox Sumber).
      expect(container.querySelector("#status")).toBeNull()
      unmount(root, container)
    })
  })
})
