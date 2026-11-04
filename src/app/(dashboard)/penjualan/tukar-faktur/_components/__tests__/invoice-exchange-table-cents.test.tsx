// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }) as MediaQueryList)

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/penjualan/tukar-faktur",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/actions/invoice-exchange.actions", () => ({
  deleteInvoiceExchange: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/components/ui/action-dropdown", () => ({ ActionDropdown: () => null }))

import { InvoiceExchangeTable } from "../invoice-exchange-table"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("InvoiceExchangeTable: nominal bersen", () => {
  it("nilai tukar faktur dan sisanya tampil hingga sen", () => {
    const { container, root } = renderCard(
      <InvoiceExchangeTable
        data={[
          {
            id: 1,
            documentNo: "IE-0001",
            date: "2026-10-05",
            customerName: "PT Uji",
            receiptNumber: "RCP-1",
            dueDate: "2026-11-05",
            invoiceCount: 2,
            amount: 1_000_000.5,
            paid: 400_000.5,
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("1.000.000,50")
    expect(text).toContain("600.000")
    unmountCard(root)
  })
})
