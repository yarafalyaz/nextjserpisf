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
  usePathname: () => "/pembelian/uang-muka",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/actions/purchase-advance.actions", () => ({
  deletePurchaseAdvance: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/components/ui/action-dropdown", () => ({ ActionDropdown: () => null }))

import { PurchaseAdvanceTable } from "../purchase-advance-table"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("PurchaseAdvanceTable: nominal bersen", () => {
  it("jumlah uang muka tampil hingga sen", () => {
    const { container, root } = renderCard(
      <PurchaseAdvanceTable
        data={[
          {
            id: 1,
            documentNo: "PA-0001",
            date: "2026-10-05",
            vendorName: "CV Sumber",
            description: null,
            amount: 1_000_000.5,
            journalId: 4,
          },
        ]}
      />,
    )
    expect(container.textContent ?? "").toContain("1.000.000,50")
    unmountCard(root)
  })
})
