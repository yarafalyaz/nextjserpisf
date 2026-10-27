// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

import { setupJsdomTableStubs, mountTable as mount, unmountTable as unmount } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
  usePathname: () => "/sdm/cuti/saldo",
  useSearchParams: () => new URLSearchParams(),
}))

import { LeaveBalanceTable, type LeaveBalanceRow } from "../leave-balance-table"
import {
  LEAVE_BALANCE_INACTIVE_LABEL,
  LEAVE_BALANCE_NOT_ELIGIBLE_LABEL,
  LEAVE_BALANCE_NO_DEPARTMENT_LABEL,
} from "@/lib/reports/leave-balance"

const row = (over: Partial<LeaveBalanceRow> = {}): LeaveBalanceRow => ({
  id: 1,
  employeeId: 1,
  name: "Budi Santoso",
  employeeNo: "EMP-001",
  departmentId: 10,
  department: "Bengkel",
  joinDate: "2020-01-06",
  isActive: true,
  entitled: 12,
  used: 5,
  usedApproved: 3,
  usedPending: 2,
  remaining: 7,
  eligible: true,
  tenureMonths: 72,
  ...over,
})

describe("LeaveBalanceTable F-2026-10-25-013-S (AC-LVB-F2/F3)", () => {
  it("terpakai disetujui + menunggu tampil terpisah verbatim server, tanpa kolom campur", () => {
    const { container, root } = mount(<LeaveBalanceTable data={[row()]} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Saldo cuti karyawan"]')).not.toBeNull()
    expect(text).toContain("Terpakai Disetujui")
    expect(text).toContain("Terpakai Menunggu")
    // Nilai per kolom (bukan teks global): mutasi accessor pending→approved MERAH di sini.
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent ?? "")
    const cells = [...container.querySelectorAll("tbody td")].map((td) => td.textContent ?? "")
    expect(cells[headers.findIndex((h) => h.includes("Terpakai Disetujui"))]).toContain("3 hari")
    expect(cells[headers.findIndex((h) => h.includes("Terpakai Menunggu"))]).toContain("2 hari")
    expect(cells[headers.findIndex((h) => h.includes("Sisa"))]).toContain("7 hari")
    expect(text).not.toContain("5 hari")
    unmount(root, container)
  })

  it("nonaktif tertanda + belum 1 tahun label server + departemen null tampil −", () => {
    const { container, root } = mount(
      <LeaveBalanceTable
        data={[
          row({
            id: 2,
            employeeId: 2,
            name: "Sari",
            employeeNo: "EMP-002",
            departmentId: null,
            department: null,
            isActive: false,
            eligible: false,
            entitled: 0,
            used: 0,
            usedApproved: 0,
            usedPending: 0,
            remaining: 0,
            tenureMonths: 3,
          }),
        ]}
      />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain(LEAVE_BALANCE_INACTIVE_LABEL)
    expect(text).toContain(LEAVE_BALANCE_NOT_ELIGIBLE_LABEL)
    expect(text).toContain(LEAVE_BALANCE_NO_DEPARTMENT_LABEL)
    unmount(root, container)
  })

  it("showIdentityColumns=false menyembunyikan kolom identitas (BR-LVB-14)", () => {
    const { container, root } = mount(<LeaveBalanceTable data={[row()]} showIdentityColumns={false} />)
    const text = container.textContent ?? ""
    expect(text).not.toContain("Budi Santoso")
    expect(text).not.toContain("Bengkel")
    expect(text).toContain("Terpakai Menunggu")
    unmount(root, container)
  })

  it("keadaan kosong: tanpa baris palsu", () => {
    const { container, root } = mount(<LeaveBalanceTable data={[]} />)
    expect(container.textContent ?? "").not.toContain("Budi Santoso")
    unmount(root, container)
  })
})
