// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const createAction = vi.fn(
  async (_formData: FormData): Promise<{ success: boolean; error?: string; id?: number }> => ({
    success: true,
  }),
)
const showError = vi.fn()
const showSuccess = vi.fn()

vi.mock("@/actions/invoice-collection.actions", () => ({
  createInvoiceCollectionFollowUp: (formData: FormData) =>
    createAction(formData),
}))
vi.mock("@/lib/utils/toast", () => ({
  showError: (...args: unknown[]) => showError(...(args as [])),
  showSuccess: (...args: unknown[]) => showSuccess(...(args as [])),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { CollectionFollowUpForm } from "../collection-followup-form"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})
beforeEach(() => {
  createAction.mockResolvedValue({ success: true })
})

function render() {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <CollectionFollowUpForm salesInvoiceId={7} documentNo="INV-0007" />,
    )
  })
  roots.push(root)
  return container
}

function openDialog(container: HTMLElement) {
  const trigger = [...container.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("Catat Tindak Lanjut"),
  )
  expect(trigger).toBeTruthy()
  act(() => {
    trigger!.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
}

describe("CollectionFollowUpForm F-2026-10-22-089-S", () => {
  it("submit kirim field kontrak BOT 3 + sukses toast", async () => {
    const container = render()
    openDialog(container)
    const form = document.body.querySelector("form")
    expect(form).toBeTruthy()
    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
    })
    expect(createAction).toHaveBeenCalledTimes(1)
    const formData = createAction.mock.calls[0][0] as FormData
    expect(formData.get("salesInvoiceId")).toBe("7")
    expect(formData.get("channel")).toBe("telepon")
    expect(formData.get("outcome")).toBe("terhubung_janji_bayar")
    expect(showSuccess).toHaveBeenCalled()
    expect(showError).not.toHaveBeenCalled()
  })

  it("error server tampil verbatim", async () => {
    createAction.mockResolvedValue({
      success: false,
      error: "Tanggal janji bayar tidak boleh sebelum tanggal tindak lanjut.",
    })
    const container = render()
    openDialog(container)
    const form = document.body.querySelector("form")
    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
    })
    expect(showError).toHaveBeenCalledWith(
      "Tanggal janji bayar tidak boleh sebelum tanggal tindak lanjut.",
    )
    expect(showSuccess).not.toHaveBeenCalled()
  })
})
