// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
  getHrScope: vi.fn(),
  loadQueue: vi.fn(),
  cardRows: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requireAnyPermission: mocks.requireAnyPermission,
}))

vi.mock("@/lib/auth/hr-scope", () => ({
  getHrScope: mocks.getHrScope,
}))

vi.mock("@/lib/reports/hr-pending-approval-data", () => ({
  loadHrPendingApprovalQueue: mocks.loadQueue,
}))

vi.mock("@/components/reports/hr-pending-approval-card", () => ({
  HR_PENDING_APPROVAL_TITLE: "Antrean Persetujuan HR",
  HrPendingApprovalCard: (props: { rows: unknown[] }) => {
    mocks.cardRows(props.rows)
    return null
  },
}))

vi.mock("@/components/ui/breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}))

import HrPendingApprovalPage from "../page"

const ROWS = [
  { kind: "leave", id: 1 },
  { kind: "overtime", id: 2 },
  { kind: "loan", id: 3 },
]

async function renderPage() {
  const node = await HrPendingApprovalPage()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  act(() => root.unmount())
  container.remove()
}

function kinds() {
  const calls = mocks.cardRows.mock.calls
  const rows = calls[calls.length - 1]?.[0] as { kind: string }[]
  return rows.map((r) => r.kind)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getHrScope.mockResolvedValue({ mode: "all" })
  mocks.loadQueue.mockResolvedValue(ROWS)
  mocks.requireAnyPermission.mockResolvedValue({
    roles: [],
    permissions: [],
  })
})

describe("gerbang loan halaman antrean persetujuan HR (syarat audit PR #876)", () => {
  it("requireAnyPermission memuat approve_loans", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_overtime", "approve_overtime_requests"],
    })
    await renderPage()
    expect(mocks.requireAnyPermission).toHaveBeenCalledWith([
      "approve_leave_requests",
      "approve_overtime_requests",
      "approve_loans",
    ])
  })

  it("pemegang lembur saja TIDAK menerima baris loan", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_overtime", "approve_overtime_requests"],
    })
    await renderPage()
    expect(kinds()).toEqual(["overtime"])
  })

  it("pemegang view_employee_loans+approve_loans menerima baris loan saja", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_employee_loans", "approve_loans"],
    })
    await renderPage()
    expect(kinds()).toEqual(["loan"])
  })

  it("approve_loans tanpa view_employee_loans TIDAK menerima baris loan", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["approve_loans"],
    })
    await renderPage()
    expect(kinds()).toEqual([])
  })

  it("pemegang cuti saja (view+approve_leave_requests) TIDAK menerima baris lembur/loan", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_leave_requests", "approve_leave_requests"],
    })
    await renderPage()
    expect(kinds()).toEqual(["leave"])
  })

  it("pemegang lembur saja (view+approve_overtime_requests) TIDAK menerima baris cuti", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["view_overtime", "approve_overtime_requests"],
    })
    await renderPage()
    expect(kinds()).not.toContain("leave")
    expect(kinds()).toEqual(["overtime"])
  })

  it("approve_leave_requests tanpa view_leave_requests TIDAK menerima baris cuti", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["approve_leave_requests"],
    })
    await renderPage()
    expect(kinds()).toEqual([])
  })

  it("approve_overtime_requests tanpa view_overtime TIDAK menerima baris lembur", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: [],
      permissions: ["approve_overtime_requests"],
    })
    await renderPage()
    expect(kinds()).toEqual([])
  })

  it("super_admin menerima semua kind", async () => {
    mocks.requireAnyPermission.mockResolvedValue({
      roles: ["super_admin"],
      permissions: [],
    })
    await renderPage()
    expect(kinds()).toEqual(["leave", "overtime", "loan"])
  })

  it("tanpa izin apa pun halaman ditolak sebelum loader", async () => {
    mocks.requireAnyPermission.mockRejectedValue(new Error("redirect:/"))
    await expect(HrPendingApprovalPage()).rejects.toThrow("redirect:/")
    expect(mocks.loadQueue).not.toHaveBeenCalled()
  })
})
