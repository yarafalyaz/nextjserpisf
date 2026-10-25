// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { setupJsdomTableStubs, mountTable as mount, unmountTable as unmount } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/sdm/klaim-reimbursement",
  useSearchParams: () => new URLSearchParams(),
}))

import { MyReimbursementClaimsTable, type MyReimbursementClaimRow } from "../my-reimbursement-claims-table"
import { formatCurrency } from "@/lib/utils/format"

const row = (over: Partial<MyReimbursementClaimRow> = {}): MyReimbursementClaimRow => ({
  id: 42,
  slug: "exp-2026-0042",
  documentNo: "EXP-2026-0042",
  employeeName: "Budi",
  amount: 1500000,
  date: "2026-10-20T00:00:00.000Z",
  referenceNo: "NOTA-001",
  description: "Transportasi proyek",
  categoryLabel: "Transportasi",
  status: "paid",
  stage: "DIBAYAR",
  stageLabel: "Disetujui",
  hasAccrualJournal: true,
  hasPaymentJournal: true,
  ...over,
})

describe("MyReimbursementClaimsTable — verbatim server (AC-RB-F1)", () => {
  it("stageLabel tampil verbatim: status=paid + stageLabel=\"Disetujui\" tampil \"Disetujui\" (bukan turunan status/stage)", () => {
    const { container, root } = mount(<MyReimbursementClaimsTable data={[row()]} />)
    expect(container.textContent).toContain("Disetujui")
    // Turunan UI dari status=paid/stage=DIBAYAR akan menampilkan "Dibayar" — dilarang.
    expect(container.textContent).not.toContain("Dibayar")
    unmount(root, container)
  })

  it("nominal tampil verbatim formatCurrency(amount)", () => {
    const { container, root } = mount(<MyReimbursementClaimsTable data={[row()]} />)
    expect(formatCurrency(1500000)).toBe("Rp 1.500.000")
    expect(container.textContent).toContain("Rp 1.500.000")
    unmount(root, container)
  })

  it("documentNo tautan ke detail pengeluaran via slug (entityHref)", () => {
    const { container, root } = mount(<MyReimbursementClaimsTable data={[row()]} />)
    const link = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "EXP-2026-0042",
    )
    expect(link).toBeTruthy()
    expect(link!.getAttribute("href")).toBe("/keuangan/pengeluaran/exp-2026-0042")
    unmount(root, container)
  })

  it("documentNo tanpa slug: tautan jatuh ke id numerik", () => {
    const { container, root } = mount(
      <MyReimbursementClaimsTable data={[row({ slug: null })]} />,
    )
    const link = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "EXP-2026-0042",
    )
    expect(link!.getAttribute("href")).toBe("/keuangan/pengeluaran/42")
    unmount(root, container)
  })
})
