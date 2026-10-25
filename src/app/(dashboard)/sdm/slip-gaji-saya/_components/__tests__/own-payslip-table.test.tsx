// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { setupJsdomTableStubs, mountTable as mount, unmountTable as unmount } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/sdm/slip-gaji-saya",
  useSearchParams: () => new URLSearchParams(),
}))

import { OwnPayslipTable, type OwnPayslipListRow } from "../own-payslip-table"
import { formatCurrency } from "@/lib/utils/format"

const row = (over: Partial<OwnPayslipListRow> = {}): OwnPayslipListRow => ({
  id: 42,
  slug: "pay-2026-0042",
  documentNo: "PAY-2026-0042",
  period: "2026-10",
  status: "paid",
  statusLabel: "Dibayar",
  paymentDate: new Date("2026-10-28T00:00:00.000Z"),
  netSalary: 7500000,
  ...over,
})

describe("OwnPayslipTable — verbatim server (F-2026-10-25-009-S)", () => {
  it("statusLabel tampil verbatim: status=approved + statusLabel=\"Disetujui\" tampil apa adanya", () => {
    const { container, root } = mount(
      <OwnPayslipTable data={[row({ status: "approved", statusLabel: "Disetujui" })]} />,
    )
    expect(container.textContent).toContain("Disetujui")
    unmount(root, container)
  })

  it("statusLabel tidak diturunkan UI dari status: label server asing tetap tampil verbatim", () => {
    const { container, root } = mount(
      <OwnPayslipTable data={[row({ status: "paid", statusLabel: "Label Server Khusus" })]} />,
    )
    expect(container.textContent).toContain("Label Server Khusus")
    // Turunan UI dari status=paid akan menampilkan "Dibayar" — dilarang.
    expect(container.textContent).not.toContain("Dibayar")
    unmount(root, container)
  })

  it("paymentDate null tampil \"Belum dibayar\" tanpa tanggal karangan", () => {
    const { container, root } = mount(
      <OwnPayslipTable data={[row({ status: "approved", statusLabel: "Disetujui", paymentDate: null })]} />,
    )
    expect(container.textContent).toContain("Belum dibayar")
    unmount(root, container)
  })

  it("netSalary tampil apa adanya dari rekod server (format Rupiah saja)", () => {
    const { container, root } = mount(<OwnPayslipTable data={[row()]} />)
    expect(container.textContent).toContain(formatCurrency(7500000))
    unmount(root, container)
  })

  it("tautan detail pakai slug bila ada, fallback id numerik (kontrak loader)", () => {
    const withSlug = mount(<OwnPayslipTable data={[row()]} />)
    expect(withSlug.container.querySelector('a[href="/sdm/slip-gaji-saya/pay-2026-0042"]')).not.toBeNull()
    unmount(withSlug.root, withSlug.container)

    const noSlug = mount(<OwnPayslipTable data={[row({ slug: null })]} />)
    expect(noSlug.container.querySelector('a[href="/sdm/slip-gaji-saya/42"]')).not.toBeNull()
    unmount(noSlug.root, noSlug.container)
  })
})
