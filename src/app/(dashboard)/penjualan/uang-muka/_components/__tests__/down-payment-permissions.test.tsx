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

vi.mock("@/actions/sales.actions", () => ({
  allocateCustomerCredit: vi.fn(async () => ({ success: true })),
  refundCustomerCredit: vi.fn(async () => ({ success: true })),
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

import { CustomerCreditPanel } from "../customer-credit-panel"

const CREDITS = [
  {
    id: 1,
    documentNo: "CC-0001",
    receivedAmount: 100000,
    allocatedAmount: 20000,
    refundedAmount: 0,
    status: "active",
  },
]
const INVOICES = [{ id: 9, documentNo: "INV-0001", grandTotal: 50000, paidAmount: 10000 }]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

describe("CustomerCreditPanel gerbang izin UI (confirm_down_payments)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only: riwayat kredit tampil, elemen aksi alokasi/refund hilang", () => {
    const { container, root } = mount(
      <CustomerCreditPanel credits={CREDITS} invoices={INVOICES} canConfirm={false} />,
    )
    expect(container.textContent).toContain("CC-0001")
    expect(container.textContent).toContain("sisa 80.000")
    expect(container.querySelector('select[aria-label="Mode kredit"]')).toBeNull()
    expect(container.querySelector('input[aria-label="Nominal kredit"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Proses kredit CC-0001"]')).toBeNull()
    act(() => root.unmount())
  })

  it("berizin: elemen aksi alokasi/refund tampil", () => {
    const { container, root } = mount(
      <CustomerCreditPanel credits={CREDITS} invoices={INVOICES} canConfirm />,
    )
    expect(container.querySelector('select[aria-label="Mode kredit"]')).not.toBeNull()
    expect(container.querySelector('input[aria-label="Nominal kredit"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Proses kredit CC-0001"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("halaman: ConfirmDownPaymentButton dibungkus CanCreate confirm_down_payments, panel menerima canConfirm", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/penjualan/uang-muka/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toMatch(
      /<CanCreate permission="confirm_down_payments">\s*<ConfirmDownPaymentButton/,
    )
    expect(page).toContain('hasPermission("confirm_down_payments")')
    expect(page).toContain("canConfirm={canConfirm}")
  })
})
