// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act } from "react"
import { MaterialIssueForm } from "../material-issue-form"
import { showSuccess, showError } from "@/lib/utils/toast"
import { createMaterialIssue } from "@/actions/inventory.actions"
import { mountInto, unmount } from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/inventory.actions", () => ({
  createMaterialIssue: vi.fn(),
  updateMaterialIssue: vi.fn().mockResolvedValue({ success: true }),
}))

const mockedCreate = vi.mocked(createMaterialIssue)
const mockedSuccess = vi.mocked(showSuccess)
const mockedError = vi.mocked(showError)

// Kontrak final Backend PR #1373 (WO-BR-004, guard form Inventaris): WO ber-MI
// aktif ditolak `{ success:false, error:"Material Issue sudah pernah dibuat
// untuk Work Order ini (No: ...)." }`. UI wajib tampilkan pesan server
// verbatim via toast, tanpa sukses/redirect.
const guardMessage =
  "Material Issue sudah pernah dibuat untuk Work Order ini (No: MI-0009)."

const warehouses = [{ id: 1, name: "Gudang Utama" }]
const items = [{ id: 7, sku: "BRG-001", name: "Busi", qtyOnHand: "10", cost: "5000" }]

async function submitForm(container: HTMLElement) {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    )
  })
  await act(async () => {})
}

describe("MaterialIssueForm — guard WO-BR-004 form Inventaris", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("guard menolak: toast verbatim pesan server + tanpa sukses", async () => {
    mockedCreate.mockResolvedValue({ success: false, error: guardMessage })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(
      container,
      <MaterialIssueForm warehouses={warehouses} items={items} defaultWorkOrderId={5} />,
    )
    await submitForm(container)
    expect(mockedCreate).toHaveBeenCalled()
    expect(mockedError).toHaveBeenCalledWith(guardMessage)
    expect(mockedSuccess).not.toHaveBeenCalled()
    const alert = container.querySelector('[role="alert"]')
    expect(alert?.textContent).toBe(guardMessage)
    unmount(root, container)
  })

  it("sukses: toast sukses, tanpa toast error dan tanpa alert", async () => {
    mockedCreate.mockResolvedValue({ success: true, id: 9, slug: "mi-0009" })
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = mountInto(
      container,
      <MaterialIssueForm warehouses={warehouses} items={items} defaultWorkOrderId={5} />,
    )
    await submitForm(container)
    expect(mockedSuccess).toHaveBeenCalledWith("Data berhasil ditambahkan")
    expect(mockedError).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).toBeNull()
    unmount(root, container)
  })
})
