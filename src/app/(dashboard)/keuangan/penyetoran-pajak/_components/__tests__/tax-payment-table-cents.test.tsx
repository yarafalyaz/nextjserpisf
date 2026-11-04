// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// DataTable memakai useIsMobile (matchMedia tak ada di jsdom).
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
  usePathname: () => "/keuangan/transfer-bank",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/actions/tax-payment.actions", () => ({
  deleteTaxPayment: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/components/ui/action-dropdown", () => ({ ActionDropdown: () => null }))

import { TaxPaymentTable } from "../tax-payment-table"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("TaxPaymentTable: nominal bersen", () => {
  it("jumlah setoran tampil hingga sen", () => {
    const { container, root } = renderCard(
      <TaxPaymentTable
        data={[
          {
            id: 1,
            documentNo: "TP-0001",
            date: "2026-10-05",
            period: "2026-09",
            typeLabel: "PPN",
            reference: "SSP-1",
            amount: 1_000_000.5,
            journalId: 9,
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("1.000.000,50")
    unmountCard(root)
  })
})
