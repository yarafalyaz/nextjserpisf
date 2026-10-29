// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/inventory.actions", () => ({
  createStockAdjustment: vi.fn(async () => ({ success: true })),
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

import { OpnameForm } from "../opname-form"

const ROWS = [
  { id: 1, sku: "SKU-1", name: "Barang Uji", uom: "pcs", systemQty: 10, unitCost: 1000 },
]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function submitButton(container: HTMLElement) {
  return (
    [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Buat Penyesuaian"),
    ) ?? null
  )
}

describe("OpnameForm gerbang izin UI (create_stock_adjustments)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only: lembar tampil, input hitung nonaktif, tombol simpan hilang", () => {
    const { container, root } = mount(
      <OpnameForm warehouseId={1} date="2026-10-30" rows={ROWS} canCreate={false} />,
    )
    expect(container.textContent).toContain("SKU-1")
    expect(container.querySelector('input[aria-label="Hasil hitung Barang Uji"]')).toHaveProperty(
      "disabled",
      true,
    )
    expect(submitButton(container)).toBeNull()
    act(() => root.unmount())
  })

  it("berizin: input hitung aktif + tombol simpan tampil", () => {
    const { container, root } = mount(
      <OpnameForm warehouseId={1} date="2026-10-30" rows={ROWS} canCreate />,
    )
    expect(container.querySelector('input[aria-label="Hasil hitung Barang Uji"]')).toHaveProperty(
      "disabled",
      false,
    )
    expect(submitButton(container)).not.toBeNull()
    act(() => root.unmount())
  })

  it("halaman meneruskan create_stock_adjustments sebagai canCreate", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/inventaris/opname/[[...segments]]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("create_stock_adjustments")')
    expect(page).toContain("canCreate={canCreate}")
  })
})
