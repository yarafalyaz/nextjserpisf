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
vi.mock("@/actions/bank-transfer.actions", () => ({
  deleteBankTransfer: vi.fn(async () => ({ success: true })),
}))
vi.mock("@/components/ui/action-dropdown", () => ({ ActionDropdown: () => null }))

import { BankTransferTable } from "../bank-transfer-table"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

describe("BankTransferTable: nominal bersen", () => {
  it("jumlah dan biaya admin tampil hingga sen", () => {
    const { container, root } = renderCard(
      <BankTransferTable
        data={[
          {
            id: 1,
            documentNo: "BT-0001",
            date: "2026-10-05",
            from: "1101 Kas",
            to: "1102 Bank",
            amount: 1_000_000.5,
            adminFee: 6_500.25,
            journalId: 9,
          },
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("1.000.000,50")
    expect(text).toContain("6.500,25")
    unmountCard(root)
  })
})
