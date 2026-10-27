import { describe, it, expect, vi, beforeEach } from "vitest"

// F-2026-10-25-018-S: Pinjaman Saya hanya menampilkan baris employeeId
// pemilik pada scope self/department/all — BUKAN hrScopeWhere (department
// melebar se-departemen, all melebar semua). Kunci self sama dengan
// halaman tambah: employee tertaut user login.

const mocks = vi.hoisted(() => ({
  prismaMock: {
    employee: { findFirst: vi.fn() },
    employeeLoan: { findMany: vi.fn() },
  },
  requirePermissionMock: vi.fn(),
  getHrScopeMock: vi.fn(),
  loadChannelsMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => mocks.requirePermissionMock(...a),
}))
vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: (...a: unknown[]) => mocks.getHrScopeMock(...a),
}))
vi.mock("@/lib/reports/employee-loan-channel-data", () => ({
  loadEmployeeLoanChannels: (...a: unknown[]) => mocks.loadChannelsMock(...a),
}))
vi.mock("next/navigation", () => ({
  notFound: () => mocks.notFoundMock(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sdm/pinjaman-saya",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/actions/hrm.actions", () => ({ deleteEmployeeLoan: vi.fn() }))
vi.mock("@/actions/bulk.actions", () => ({ bulkDelete: vi.fn() }))
import MyLoanRequestsPage from "../page"
import { renderToStaticMarkup } from "react-dom/server"
import React from "react"

const loanRow = (id: number, employeeId: number) => ({
  id,
  loanDate: new Date("2026-10-01T00:00:00.000Z"),
  totalAmount: 5000000,
  monthlyInstallment: 500000,
  remainingAmount: 4000000,
  status: "pending",
  employeeId,
  createdBy: 99,
})

async function renderPage() {
  const el = await MyLoanRequestsPage()
  return renderToStaticMarkup(el as React.ReactElement)
}

describe("Pinjaman Saya — scope self pemilik", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermissionMock.mockResolvedValue({ id: "99", roles: ["karyawan"] })
    mocks.loadChannelsMock.mockResolvedValue(new Map())
    mocks.prismaMock.employeeLoan.findMany.mockResolvedValue([loanRow(7, 42)])
  })

  it("scope self: query dikunci employeeId pemilik dari scope", async () => {
    mocks.getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: 42 })
    const html = await renderPage()
    expect(mocks.prismaMock.employeeLoan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: 42 } }),
    )
    expect(html).toContain("Rp 5.000.000")
  })

  it("scope department: tetap hanya pemilik, bukan se-departemen", async () => {
    mocks.getHrScopeMock.mockResolvedValue({ kind: "department", departmentId: 3, employeeId: 42 })
    mocks.prismaMock.employee.findFirst.mockResolvedValue({ id: 42 })
    const html = await renderPage()
    expect(mocks.prismaMock.employeeLoan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: 42 } }),
    )
    const where = mocks.prismaMock.employeeLoan.findMany.mock.calls[0][0].where
    expect(where).not.toHaveProperty("employee")
    expect(html).toContain("Rp 5.000.000")
  })

  it("scope all: tetap hanya pemilik dari lookup userId", async () => {
    mocks.getHrScopeMock.mockResolvedValue({ kind: "all" })
    mocks.prismaMock.employee.findFirst.mockResolvedValue({ id: 42 })
    await renderPage()
    expect(mocks.prismaMock.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 99 } }),
    )
    expect(mocks.prismaMock.employeeLoan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: 42 } }),
    )
  })

  it("user tanpa employee tertaut (scope all): notFound, nol query pinjaman", async () => {
    mocks.getHrScopeMock.mockResolvedValue({ kind: "all" })
    mocks.prismaMock.employee.findFirst.mockResolvedValue(null)
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.prismaMock.employeeLoan.findMany).not.toHaveBeenCalled()
  })

  it("scope self tanpa employee tertaut (employeeId -1): query kunci -1, nol baris tampil", async () => {
    mocks.getHrScopeMock.mockResolvedValue({ kind: "self", employeeId: -1 })
    mocks.prismaMock.employeeLoan.findMany.mockResolvedValue([])
    const html = await renderPage()
    expect(mocks.prismaMock.employeeLoan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: -1 } }),
    )
    expect(html).toContain("Belum ada pengajuan pinjaman")
  })
})
