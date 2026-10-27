// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Radix Switch/AlertDialog pakai ResizeObserver; jsdom tidak punya (pola repo).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"
import { WorkflowForm, type WorkflowFormData } from "../workflow-form"

const updateMock = vi.fn(async (_id: number, _formData: FormData) => ({ success: true }))
const createMock = vi.fn(async (_formData: FormData) => ({ success: true }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))
vi.mock("@/actions/approval.actions", () => ({
  createApprovalWorkflow: (formData: FormData) => createMock(formData),
  updateApprovalWorkflow: (id: number, formData: FormData) => updateMock(id, formData),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

const roles = [{ id: 1, name: "Finance" }]

function workflow(modelType: string): WorkflowFormData {
  return {
    id: 5,
    name: "Gerbang Uji",
    code: "APR-UJI",
    modelType,
    isActive: true,
    steps: [{ name: "Langkah 1", roleId: 1, approverType: null }],
  }
}

function mount(ui: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { root, container }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ""
}

async function submitForm(container: HTMLElement) {
  const form = container.querySelector("form") as HTMLFormElement
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

async function turnOffActiveSwitch(container: HTMLElement) {
  const sw = container.querySelector("button[role='switch']") as HTMLButtonElement
  expect(sw).not.toBeNull()
  expect(sw.getAttribute("aria-checked")).toBe("true")
  await act(async () => {
    sw.click()
  })
}

function dialogText(): string {
  return document.body.textContent ?? ""
}

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("WorkflowForm gerbang uang (K4-S2b)", () => {
  it("menonaktifkan workflow Journal aktif: simpan ditahan, dialog gerbang uang mati tampil, konfirmasi baru submit", async () => {
    const { root, container } = mount(<WorkflowForm workflow={workflow("Journal")} roles={roles} />)
    await turnOffActiveSwitch(container)

    // Peringatan inline tampil sebelum simpan.
    expect(container.querySelector("[role='alert']")?.textContent).toContain("Peringatan gerbang uang")

    await submitForm(container)
    expect(updateMock).not.toHaveBeenCalled()
    expect(dialogText()).toContain("Nonaktifkan workflow gerbang uang ini?")
    expect(dialogText()).toContain("gerbang uang mati")
    expect(dialogText()).toContain("Jurnal manual bisa diposting tanpa persetujuan")

    const confirm = findButtonByText("Ya, Nonaktifkan")
    expect(confirm).toBeDefined()
    await act(async () => {
      confirm!.click()
    })
    expect(updateMock).toHaveBeenCalledTimes(1)
    unmount(root, container)
  })

  it("batal di dialog: simpan tidak pernah terkirim", async () => {
    const { root, container } = mount(<WorkflowForm workflow={workflow("VendorPayment")} roles={roles} />)
    await turnOffActiveSwitch(container)
    await submitForm(container)
    expect(updateMock).not.toHaveBeenCalled()
    expect(dialogText()).toContain("Pembayaran vendor bisa dikonfirmasi dan diposting tanpa persetujuan")

    const cancel = findButtonByText("Batal")
    expect(cancel).toBeDefined()
    await act(async () => {
      cancel!.click()
    })
    expect(updateMock).not.toHaveBeenCalled()
    unmount(root, container)
  })

  it("menonaktifkan workflow non-uang (PurchaseOrder): langsung submit tanpa dialog gerbang", async () => {
    const { root, container } = mount(<WorkflowForm workflow={workflow("PurchaseOrder")} roles={roles} />)
    await turnOffActiveSwitch(container)
    expect(container.querySelector("[role='alert']")).toBeNull()

    await submitForm(container)
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(dialogText()).not.toContain("gerbang uang mati")
    unmount(root, container)
  })

  it("workflow Journal tetap aktif: langsung submit tanpa dialog gerbang", async () => {
    const { root, container } = mount(<WorkflowForm workflow={workflow("Journal")} roles={roles} />)
    await submitForm(container)
    expect(updateMock).toHaveBeenCalledTimes(1)
    expect(dialogText()).not.toContain("gerbang uang mati")
    unmount(root, container)
  })
})
