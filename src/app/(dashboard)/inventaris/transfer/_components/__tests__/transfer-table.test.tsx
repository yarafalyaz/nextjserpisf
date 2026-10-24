// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Radix/DataTable pakai observer + matchMedia; jsdom tidak punya (pola repo).
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as typeof window.matchMedia

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/inventaris/transfer",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/actions/inventory.actions", () => ({
  deleteInventoryTransfer: vi.fn(),
}))

vi.mock("@/actions/bulk.actions", () => ({
  bulkDelete: vi.fn(),
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { permissions: [] } } }),
}))

import { TransferTable } from "../transfer-table"

function mount(element: React.ReactElement) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(element) })
  return { container, root }
}

function unmount(root: Root, container: HTMLElement) {
  act(() => root.unmount())
  container.remove()
}

const row = (status: string) => ({
  id: 7,
  documentNo: "TRF-001",
  slug: "trf-001",
  sourceWarehouse: { name: "Gudang Asal" },
  destinationWarehouse: { name: "Gudang Tujuan" },
  date: "2026-10-22T00:00:00.000Z",
  status,
})

describe("transfer-table — label status F-2026-10-22-081-S §6 (LOW-2)", () => {
  it('processed tampil "Dalam Perjalanan" (bukan "Diproses")', () => {
    const { container, root } = mount(
      <TransferTable data={[row("processed")]} total={1} page={1} pageSize={10} />,
    )
    expect(container.textContent).toContain("Dalam Perjalanan")
    expect(container.textContent).not.toContain("Diproses")
    unmount(root, container)
  })

  it('partially_received tampil "Diterima Sebagian" dari STATUS_LABELS', () => {
    const { container, root } = mount(
      <TransferTable data={[row("partially_received")]} total={1} page={1} pageSize={10} />,
    )
    expect(container.textContent).toContain("Diterima Sebagian")
    unmount(root, container)
  })
})
