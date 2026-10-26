// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

vi.mock("@/lib/utils/toast", () => ({
  showError: mocks.showError,
  showSuccess: mocks.showSuccess,
}))

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { QuickAddSelect, type QuickAddAction } from "../quick-add-select"
import { stubPopoverDom } from "@/components/reports/__tests__/card-test-utils"
import { CUSTOMER_REUSED_MESSAGE } from "@/lib/services/customer-duplicate.service"

stubPopoverDom()

const REUSED_MESSAGE = CUSTOMER_REUSED_MESSAGE
const GENERIC_MESSAGE = "Tambah Pelanggan berhasil ditambahkan"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => act(() => root.unmount()))
  roots = []
  document.body.replaceChildren()
  vi.clearAllMocks()
})

async function submitQuickAdd(action: QuickAddAction) {
  const onCreated = vi.fn()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(
      <QuickAddSelect
        options={[]}
        title="Tambah Pelanggan"
        fields={[{ name: "name", label: "Nama", required: true }]}
        action={action}
        onCreated={onCreated}
      />,
    )
  })
  roots.push(root)

  const combo = container.querySelector('[role="combobox"]')
  if (!combo) throw new Error("Combobox quick-add tidak ditemukan")
  await act(async () => {
    combo.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })
  const createButton = [...document.body.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").includes("Tambah baru"),
  )
  if (!createButton) throw new Error("Tombol Tambah baru tidak ditemukan")
  await act(async () => {
    createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  })

  const nameInput = document.body.querySelector<HTMLInputElement>("#quick-add-name")
  if (!nameInput) throw new Error("Field nama dialog tidak ditemukan")
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!
  await act(async () => {
    setter.call(nameInput, "Budi Santoso")
    nameInput.dispatchEvent(new Event("input", { bubbles: true }))
  })

  const form = document.body.querySelector("form")
  if (!form) throw new Error("Form dialog tidak ditemukan")
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
  return onCreated
}

describe("QuickAddSelect — cabang reused F-2026-10-25-003-S (BR-CD-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reused=true: pesan server verbatim tampil (bukan generik), id existing diteruskan ke onCreated, dialog tertutup", async () => {
    const onCreated = await submitQuickAdd(async () => ({
      success: true,
      id: 7,
      reused: true,
      message: REUSED_MESSAGE,
    }))
    expect(onCreated).toHaveBeenCalledWith({ id: 7, label: "Budi Santoso" })
    expect(mocks.showSuccess).toHaveBeenCalledWith(REUSED_MESSAGE)
    expect(mocks.showSuccess).not.toHaveBeenCalledWith(GENERIC_MESSAGE)
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(document.body.querySelector("#quick-add-name")).toBeNull()
  })

  it("tanpa penanda reused: pesan sukses generik tetap dipakai", async () => {
    const onCreated = await submitQuickAdd(async () => ({ success: true, id: 9 }))
    expect(onCreated).toHaveBeenCalledWith({ id: 9, label: "Budi Santoso" })
    expect(mocks.showSuccess).toHaveBeenCalledWith(GENERIC_MESSAGE)
    expect(mocks.showSuccess).not.toHaveBeenCalledWith(REUSED_MESSAGE)
  })

  it("reused=true tanpa message: jatuh ke generik (pesan kosong tidak ditampilkan)", async () => {
    await submitQuickAdd(async () => ({ success: true, id: 7, reused: true }))
    expect(mocks.showSuccess).toHaveBeenCalledWith(GENERIC_MESSAGE)
    expect(mocks.showSuccess).not.toHaveBeenCalledWith(REUSED_MESSAGE)
  })
})
