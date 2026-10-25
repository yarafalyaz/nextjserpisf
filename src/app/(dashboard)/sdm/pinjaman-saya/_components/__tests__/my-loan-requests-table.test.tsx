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

import { MyLoanRequestsTable, type MyLoanRequestRow } from "../my-loan-requests-table"

const row = (over: Partial<MyLoanRequestRow> = {}): MyLoanRequestRow => ({
  id: 7,
  loanDate: "2026-10-01T00:00:00.000Z",
  totalAmount: 5000000,
  monthlyInstallment: 500000,
  remainingAmount: 5000000,
  status: "pending",
  channel: "mandiri",
  ...over,
})

describe("MyLoanRequestsTable — F-2026-10-25-018-S", () => {
  it("status pending tampil label Menunggu + kanal Pengajuan Mandiri verbatim", () => {
    const { container, root } = mount(<MyLoanRequestsTable data={[row()]} />)
    expect(container.textContent).toContain("Menunggu")
    expect(container.textContent).toContain("Pengajuan Mandiri")
    unmount(root, container)
  })

  it("kanal titipan tampil Titipan Staf", () => {
    const { container, root } = mount(<MyLoanRequestsTable data={[row({ channel: "titipan", status: "active" })]} />)
    expect(container.textContent).toContain("Titipan Staf")
    unmount(root, container)
  })

  it("status di luar kosakata tertutup tampil apa adanya, tidak dipetakan paksa", () => {
    const { container, root } = mount(<MyLoanRequestsTable data={[row({ status: "status-asing-server" })]} />)
    expect(container.textContent).toContain("status-asing-server")
    unmount(root, container)
  })

  it("tanpa aksi ubah/hapus di permukaan mandiri", () => {
    const { container, root } = mount(<MyLoanRequestsTable data={[row()]} />)
    expect(container.textContent).not.toContain("Hapus")
    expect(container.querySelector('a[href*="/ubah"]')).toBeNull()
    unmount(root, container)
  })
})
