// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { setupJsdomTableStubs, mountTable as mount, unmountTable as unmount } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/sdm/pinjaman-saya",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/actions/hrm.actions", () => ({ deleteEmployeeLoan: vi.fn() }))
vi.mock("@/actions/bulk.actions", () => ({ bulkDelete: vi.fn() }))

import { LoanTable } from "../loan-table"

const row = (over: Record<string, unknown> = {}) => ({
  id: 7,
  slug: null,
  employee: { name: "" },
  loanDate: "2026-10-01T00:00:00.000Z",
  totalAmount: 5000000,
  monthlyInstallment: 500000,
  remainingAmount: 5000000,
  status: "pending",
  channel: "Pengajuan Mandiri",
  ...over,
})

describe("LoanTable mode mandiri readOnly — F-2026-10-25-018-S", () => {
  it("status pending tampil Menunggu + kanal verbatim server", () => {
    const { container, root } = mount(
      <LoanTable data={[row()]} total={1} page={1} pageSize={10} showActions={false} showEmployeeColumn={false} readOnly />,
    )
    expect(container.textContent).toContain("Menunggu")
    expect(container.textContent).toContain("Pengajuan Mandiri")
    unmount(root, container)
  })

  it("status di luar kosakata tampil apa adanya (fallback statusLabel)", () => {
    const { container, root } = mount(
      <LoanTable data={[row({ status: "status-asing-server" })]} total={1} page={1} pageSize={10} showActions={false} showEmployeeColumn={false} readOnly />,
    )
    expect(container.textContent).toContain("status-asing-server")
    unmount(root, container)
  })

  it("tanpa kolom aksi/seleksi massal di permukaan mandiri", () => {
    const { container, root } = mount(
      <LoanTable data={[row()]} total={1} page={1} pageSize={10} showActions={false} showEmployeeColumn={false} readOnly />,
    )
    expect(container.textContent).not.toContain("Aksi")
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    unmount(root, container)
  })
})
