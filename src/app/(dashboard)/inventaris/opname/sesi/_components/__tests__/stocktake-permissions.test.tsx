// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  CreateStocktakeSession: vi.fn(async (_fd: FormData) => ({ success: true })),
}))

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/inventory.actions", () => ({
  createStocktakeSession: mocks.CreateStocktakeSession,
  snapshotStocktakeSession: vi.fn(async () => ({ success: true })),
  saveStocktakeCounts: vi.fn(async () => ({ success: true })),
  approveStocktakeSession: vi.fn(async () => ({ success: true })),
  postStocktakeSession: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    ...rest
  }: {
    children: React.ReactNode
    isDisabled?: boolean
    [key: string]: unknown
  }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>
      {children}
    </button>
  ),
}))

import { StocktakeSessionForm, StocktakeActions, StocktakeLineForm } from "../stocktake-forms"

const LINES = [{ id: 1, sku: "SKU-1", name: "Barang Uji", systemQty: 10, count1: null, count2: null }]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

function buttonByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent === text) ?? null
}

describe("gerbang izin UI opname", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only: form sesi baru tidak dirender", () => {
    const { container, root } = mount(<StocktakeSessionForm canCreate={false} />)
    expect(container.querySelector('form[aria-label="Buat sesi opname"]')).toBeNull()
    act(() => root.unmount())
  })

  it("canCreate: form sesi baru dirender", () => {
    const { container, root } = mount(<StocktakeSessionForm canCreate />)
    expect(container.querySelector('form[aria-label="Buat sesi opname"]')).not.toBeNull()
    expect(buttonByText(container, "Buat Sesi")).not.toBeNull()
    act(() => root.unmount())
  })

  it("putaran 67: submit sesi kirim idempotencyKey stabil ke createStocktakeSession", async () => {
    const { container, root } = mount(<StocktakeSessionForm canCreate />)
    const form = container.querySelector('form[aria-label="Buat sesi opname"]') as HTMLFormElement
    const input = container.querySelector('input[name="warehouseId"]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!
      setter.call(input, "1")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    })
    expect(mocks.CreateStocktakeSession).toHaveBeenCalledTimes(1)
    const fd = mocks.CreateStocktakeSession.mock.calls[0][0] as FormData
    expect(typeof fd.get("idempotencyKey")).toBe("string")
    expect(String(fd.get("idempotencyKey"))).not.toBe("")
    act(() => root.unmount())
  })

  it("view-only: Snapshot/Setujui/Posting semua tersembunyi", () => {
    for (const status of ["draft", "review", "approved"]) {
      const { container, root } = mount(
        <StocktakeActions id={1} status={status} canCreate={false} canEdit={false} />,
      )
      expect(buttonByText(container, "Snapshot")).toBeNull()
      expect(buttonByText(container, "Setujui")).toBeNull()
      expect(buttonByText(container, "Posting")).toBeNull()
      act(() => root.unmount())
    }
  })

  it("Snapshot + Posting digerbang create_stock_adjustments, Setujui digerbang edit_stock_adjustments", () => {
    const draft = mount(<StocktakeActions id={1} status="draft" canCreate canEdit={false} />)
    expect(buttonByText(draft.container, "Snapshot")).not.toBeNull()
    act(() => draft.root.unmount())

    const reviewNoEdit = mount(<StocktakeActions id={1} status="review" canCreate canEdit={false} />)
    expect(buttonByText(reviewNoEdit.container, "Setujui")).toBeNull()
    act(() => reviewNoEdit.root.unmount())

    const reviewEdit = mount(<StocktakeActions id={1} status="review" canCreate={false} canEdit />)
    expect(buttonByText(reviewEdit.container, "Setujui")).not.toBeNull()
    act(() => reviewEdit.root.unmount())

    const approved = mount(<StocktakeActions id={1} status="approved" canCreate canEdit={false} />)
    expect(buttonByText(approved.container, "Posting")).not.toBeNull()
    act(() => approved.root.unmount())
  })

  it("view-only: input hitungan nonaktif + tombol Simpan Hitungan tersembunyi", () => {
    const { container, root } = mount(<StocktakeLineForm sessionId={1} lines={LINES} canCreate={false} />)
    expect(container.querySelector('input[aria-label="Hitung 1 baris 1"]')).toHaveProperty("disabled", true)
    expect(container.querySelector('input[aria-label="Hitung 2 baris 1"]')).toHaveProperty("disabled", true)
    expect(buttonByText(container, "Simpan Hitungan")).toBeNull()
    act(() => root.unmount())
  })

  it("canCreate: input hitungan aktif + tombol Simpan Hitungan tampil", () => {
    const { container, root } = mount(<StocktakeLineForm sessionId={1} lines={LINES} canCreate />)
    expect(container.querySelector('input[aria-label="Hitung 1 baris 1"]')).toHaveProperty("disabled", false)
    expect(buttonByText(container, "Simpan Hitungan")).not.toBeNull()
    act(() => root.unmount())
  })
})

describe("halaman opname meneruskan izin", () => {
  it("daftar + detail mengambil create/edit_stock_adjustments dan meneruskannya", () => {
    const list = source("src/app/(dashboard)/inventaris/opname/sesi/page.tsx")
    const detail = source("src/app/(dashboard)/inventaris/opname/sesi/[slug]/page.tsx")
    for (const page of [list, detail]) {
      expect(page).toContain('requirePermission("view_stock_opname")')
      expect(page).toContain('hasPermission("create_stock_adjustments")')
      expect(page).toContain('hasPermission("edit_stock_adjustments")')
      expect(page).toContain("canCreate={canCreate}")
      expect(page).toContain("canEdit={canEdit}")
    }
  })
})
