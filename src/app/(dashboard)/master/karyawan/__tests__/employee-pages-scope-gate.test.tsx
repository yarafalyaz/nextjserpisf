// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { Suspense, act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"

/**
 * Gerbang baca karyawan (daftar / detail / loader ubah):
 *  (a) daftar: where memuat HR scope (department/self/team) DAN select TIDAK
 *      memuat field sensitif (baseSalary, bankAccountNumber, npwp, BPJS).
 *  (b) detail lintas-scope: notFound() SEBELUM query panel pertama.
 *  (c) loader ubah lintas-scope: notFound().
 *  (d) loader ubah tanpa view_salary_amounts: baseSalary asli tidak turun.
 *
 * Prisma + modul auth di-mock; hr-scope ASLI dipakai supaya fragment where
 * yang diuji adalah yang benar-benar dipakai produksi. Komponen anak berat
 * di-mock ringan; render hanya memakai container jsdom untuk membaca teks
 * (masking) dan props yang diterima form.
 */

const SECRET_SALARY = 9876543
const REAL_SALARY = 5000000

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  hasPermission: vi.fn(),
  canViewSalaryAmounts: vi.fn(),
  employeeFindMany: vi.fn(),
  employeeFindFirst: vi.fn(),
  employeeFindUnique: vi.fn(),
  employeeCount: vi.fn(),
  probationReviewFindMany: vi.fn(),
  departmentFindMany: vi.fn(),
  positionFindMany: vi.fn(),
  roleFindMany: vi.fn(),
  getLeaveQuota: vi.fn(),
  getEmployeeLifecycleAttention: vi.fn(),
  getEmployeePayrollComponents: vi.fn(),
  getPayrollComponents: vi.fn(),
  getContractDecisionRequests: vi.fn(),
  getProbationOverview: vi.fn(),
  getSalaryAdjustments: vi.fn(),
  employeeFormProps: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    employee: {
      findMany: mocks.employeeFindMany,
      findFirst: mocks.employeeFindFirst,
      findUnique: mocks.employeeFindUnique,
      count: mocks.employeeCount,
    },
    probationReview: { findMany: mocks.probationReviewFindMany },
    department: { findMany: mocks.departmentFindMany },
    position: { findMany: mocks.positionFindMany },
    role: { findMany: mocks.roleFindMany },
  },
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: mocks.requirePermission,
  hasPermission: mocks.hasPermission,
}))

vi.mock("@/lib/auth/field-visibility", () => ({
  canViewSalaryAmounts: mocks.canViewSalaryAmounts,
}))

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("@/lib/services/leave-quota.service", () => ({
  getLeaveQuota: mocks.getLeaveQuota,
}))

vi.mock("@/actions/hrm.actions", () => ({
  getEmployeeLifecycleAttention: mocks.getEmployeeLifecycleAttention,
  getEmployeePayrollComponents: mocks.getEmployeePayrollComponents,
  getPayrollComponents: mocks.getPayrollComponents,
}))

vi.mock("@/actions/probation.actions", () => ({
  getContractDecisionRequests: mocks.getContractDecisionRequests,
  getProbationOverview: mocks.getProbationOverview,
}))

vi.mock("@/actions/salary-adjustment.actions", () => ({
  getSalaryAdjustments: mocks.getSalaryAdjustments,
}))

vi.mock("@/actions/master.actions", () => ({ deleteEmployee: vi.fn() }))

vi.mock("@/components/forms/employee-form", () => ({
  EmployeeForm: (props: Record<string, unknown>) => {
    mocks.employeeFormProps(props)
    return <div data-testid="employee-form" />
  },
}))

// Komponen anak daftar/detail: render passthrough ringan.
vi.mock("../_components/employee-table", () => ({
  EmployeeTable: () => <div data-testid="employee-table" />,
}))
vi.mock("../_components/employee-lifecycle-attention-card", () => ({
  EmployeeLifecycleAttentionCard: () => null,
}))
vi.mock("../_components/probation-contract-panel", () => ({
  ProbationContractPanel: () => null,
}))
vi.mock("../[slug]/_components/salary-adjustment-form", () => ({
  SalaryAdjustmentForm: () => null,
  CancelSalaryAdjustmentButton: () => null,
}))
vi.mock("../_components/salary-adjustment-panel", () => ({
  SalaryAdjustmentPanel: () => null,
}))
vi.mock("@/components/payroll/employee-payroll-components", () => ({
  EmployeePayrollComponents: () => null,
}))
vi.mock("@/components/ui/breadcrumbs", () => ({ AppBreadcrumbs: () => null }))
vi.mock("@/components/auth/can-create", () => ({
  CanCreate: ({ children }: { children?: ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/ui/delete-button", () => ({ DeleteButton: () => null }))

import EmployeesPage from "../page"
import EmployeeDetailPage from "../[slug]/page"
import EditEmployeePage from "../[slug]/ubah/page"

const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function employeeRow(over: Record<string, unknown> = {}) {
  return {
    id: 42,
    slug: "budi",
    userId: 9,
    user: { id: 9, roles: [] },
    departmentId: 3,
    department: { name: "Bengkel" },
    position: { name: "Mekanik" },
    manager: { name: "Kepala" },
    employeeNo: "EMP-042",
    name: "Budi",
    email: "budi@example.id",
    phone: "0812",
    gender: null,
    dateOfBirth: null,
    maritalStatus: null,
    dependents: 0,
    positionId: 2,
    managerId: null,
    joinDate: d("2024-01-15"),
    leaveEligibilityStartDate: null,
    employmentStatus: "PKWTT",
    contractStartDate: null,
    contractEndDate: null,
    probationEndDate: null,
    employmentEndedAt: null,
    endReason: null,
    paymentFrequency: "MONTHLY",
    baseSalary: REAL_SALARY,
    province: null,
    employeeCity: null,
    employeeDistrict: null,
    employeeVillage: null,
    postalCode: null,
    isActive: true,
    leaveRequests: [],
    overtimeRequests: [],
    payrolls: [],
    employeeLoans: [],
    ...over,
  }
}

let root: ReturnType<typeof createRoot> | null = null

async function renderNode(node: ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<Suspense fallback={null}>{node}</Suspense>)
  })
  return container
}

function unmount() {
  if (root) {
    const r = root
    root = null
    act(() => r.unmount())
  }
  document.body.replaceChildren()
}

beforeEach(() => {
  vi.clearAllMocks()
  // Actor default: karyawan biasa (bukan role all-access HR) terhubung ke
  // employee id 30. hr-scope asli: getHrScope me-resolve employee via
  // prisma.employee.findFirst({ where: { userId } }).
  mocks.requirePermission.mockResolvedValue({ id: "9", roles: ["karyawan"], permissions: [] })
  mocks.hasPermission.mockResolvedValue(false)
  mocks.canViewSalaryAmounts.mockResolvedValue(false)
  mocks.employeeFindFirst.mockResolvedValue({ id: 30, departmentId: 5 })
  mocks.employeeFindMany.mockResolvedValue([])
  mocks.employeeCount.mockResolvedValue(0)
  mocks.employeeFindUnique.mockResolvedValue(null)
  mocks.probationReviewFindMany.mockResolvedValue([])
  mocks.departmentFindMany.mockResolvedValue([])
  mocks.positionFindMany.mockResolvedValue([])
  mocks.roleFindMany.mockResolvedValue([])
  mocks.getLeaveQuota.mockResolvedValue({
    year: 2026, eligible: false, entitled: 0, used: 0, remaining: 0,
  })
  mocks.getEmployeeLifecycleAttention.mockResolvedValue({ success: true, rows: [] })
  mocks.getContractDecisionRequests.mockResolvedValue([])
  mocks.getProbationOverview.mockResolvedValue([])
  mocks.getSalaryAdjustments.mockResolvedValue({ success: true, data: [] })
})

describe("(a) daftar karyawan — HR scope + select sempit", () => {
  it("scope self: where daftar & count memuat id sendiri; select tanpa field sensitif", async () => {
    const node = await EmployeesPage({ searchParams: Promise.resolve({}) })
    expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1)
    const arg = mocks.employeeFindMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ deletedAt: null, id: 30 })
    expect(arg.select).toBeDefined()
    expect(arg.include).toBeUndefined()
    const select = arg.select as Record<string, unknown>
    for (const f of ["baseSalary", "bankAccountNumber", "bankAccountHolder", "bankName", "npwp", "bpjsKetenagakerjaan", "bpjsKesehatan", "idNumber", "email", "dateOfBirth", "street"]) {
      expect(select).not.toHaveProperty(f)
    }
    // Field yang dirender EmployeeTable tetap ada.
    for (const f of ["id", "slug", "employeeNo", "name", "phone", "employmentStatus", "isActive"]) {
      expect(select).toHaveProperty(f)
    }
    expect(select.department).toEqual({ select: { name: true } })
    expect(select.position).toEqual({ select: { name: true } })
    expect(select.user).toEqual({ select: { roles: { select: { name: true } } } })
    expect(mocks.employeeCount).toHaveBeenCalledWith({ where: arg.where })
    unmount()
    await renderNode(node)
    unmount()
  })

  it("scope department (kepala_bengkel): where memuat departmentId di daftar & count", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: ["kepala_bengkel"], permissions: [] })
    await EmployeesPage({ searchParams: Promise.resolve({}) })
    const arg = mocks.employeeFindMany.mock.calls[0][0]
    expect(arg.where).toMatchObject({ deletedAt: null, departmentId: 5 })
    expect(mocks.employeeCount).toHaveBeenCalledWith({ where: arg.where })
  })

  it("scope team (view_subordinate_data): where memuat id in memberIds", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: ["karyawan"], permissions: ["view_subordinate_data"] })
    // findFirst #1 = getHrScope (me), sisanya = BFS bawahan getSubordinateIds.
    mocks.employeeFindFirst.mockResolvedValue({ id: 30, departmentId: 5 })
    mocks.employeeFindMany
      .mockResolvedValueOnce([{ id: 31 }]) // BFS lapis 1
      .mockResolvedValueOnce([]) // BFS lapis 2 (habis)
      .mockResolvedValue([]) // query daftar
    await EmployeesPage({ searchParams: Promise.resolve({}) })
    const listCall = mocks.employeeFindMany.mock.calls.at(-1)![0]
    expect(listCall.where).toMatchObject({ id: { in: [30, 31] } })
    expect(mocks.employeeCount).toHaveBeenCalledWith({ where: listCall.where })
  })
})

describe("(b) detail karyawan — gerbang scope di depan + masking", () => {
  it("lintas-scope (self): notFound sebelum query panel pertama (getLeaveQuota)", async () => {
    // findFirst pertama resolveEntity(bySlug) → karyawan 42; findFirst kedua
    // getHrScope(me=30). Scope self 30 vs employee 42 → di luar scope.
    mocks.employeeFindFirst
      .mockResolvedValueOnce(employeeRow())
      .mockResolvedValue({ id: 30, departmentId: 5 })
    await expect(
      EmployeeDetailPage({ params: Promise.resolve({ slug: "budi" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.getLeaveQuota).not.toHaveBeenCalled()
    expect(mocks.getProbationOverview).not.toHaveBeenCalled()
    expect(mocks.probationReviewFindMany).not.toHaveBeenCalled()
  })

  it("dalam scope (all): payroll + pinjaman tampil ter-mask tanpa izin gaji, label tetap tampil", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["ga"], permissions: [] })
    mocks.employeeFindFirst.mockResolvedValueOnce(
      employeeRow({
        payrolls: [
          { id: 1, documentNo: "PR-1", period: "2026-10", baseSalary: SECRET_SALARY, netSalary: SECRET_SALARY + 1, status: "posted" },
        ],
        employeeLoans: [
          { id: 2, totalAmount: SECRET_SALARY + 2, monthlyInstallment: 100000, remainingAmount: SECRET_SALARY + 3, loanDate: d("2026-01-01") },
        ],
      }),
    )
    const node = await EmployeeDetailPage({ params: Promise.resolve({ slug: "budi" }) })
    const container = await renderNode(node)
    const text = container.textContent ?? ""
    expect(text).toContain("Gaji Pokok")
    expect(text).toContain("Pinjaman Aktif")
    expect(text).toContain("••••••")
    expect(text).not.toContain("9.876")
    expect(text).not.toContain(SECRET_SALARY.toLocaleString("id-ID"))
    unmount()
  })

  it("dalam scope + izin gaji: nominal payroll tampil apa adanya", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["ga"], permissions: [] })
    mocks.canViewSalaryAmounts.mockResolvedValue(true)
    mocks.hasPermission.mockResolvedValue(true)
    mocks.getEmployeePayrollComponents.mockResolvedValue({ success: true, data: [] })
    mocks.getPayrollComponents.mockResolvedValue({ success: true, data: [] })
    mocks.employeeFindFirst.mockResolvedValueOnce(
      employeeRow({
        payrolls: [
          { id: 1, documentNo: "PR-1", period: "2026-10", baseSalary: REAL_SALARY, netSalary: REAL_SALARY, status: "posted" },
        ],
      }),
    )
    const node = await EmployeeDetailPage({ params: Promise.resolve({ slug: "budi" }) })
    const container = await renderNode(node)
    expect(container.textContent).toContain("5.000.000")
    unmount()
  })
})

describe("(c)(d) loader ubah karyawan — scope + gerbang gaji", () => {
  function editMocks(row: ReturnType<typeof employeeRow>) {
    // resolveEntity bySlug → findFirst; getHrScope(actor id 9) → findFirst me.
    mocks.employeeFindFirst
      .mockResolvedValueOnce(row)
      .mockResolvedValue({ id: 30, departmentId: 5 })
  }

  it("lintas-scope (self): notFound, form tidak pernah menerima props", async () => {
    editMocks(employeeRow())
    await expect(
      EditEmployeePage({ params: Promise.resolve({ slug: "budi" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.employeeFormProps).not.toHaveBeenCalled()
    expect(mocks.departmentFindMany).not.toHaveBeenCalled()
  })

  it("lintas-scope (department): karyawan departemen lain → notFound", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "9", roles: ["kepala_bengkel"], permissions: [] })
    editMocks(employeeRow()) // employee departmentId 3; actor departmentId 5
    // assertHrEmployeeAccess(department) memanggil findUnique untuk cek dept.
    mocks.employeeFindUnique.mockResolvedValue({ departmentId: 3 })
    await expect(
      EditEmployeePage({ params: Promise.resolve({ slug: "budi" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.employeeFormProps).not.toHaveBeenCalled()
  })

  it("dalam scope tanpa izin gaji: baseSalary asli TIDAK turun ke EmployeeForm", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["ga"], permissions: [] })
    editMocks(employeeRow())
    const node = await EditEmployeePage({ params: Promise.resolve({ slug: "budi" }) })
    await renderNode(node)
    expect(mocks.employeeFormProps).toHaveBeenCalledTimes(1)
    const props = mocks.employeeFormProps.mock.calls[0][0]
    expect(props.employee.baseSalary).toBe(0)
    expect(props.employee.baseSalary).not.toBe(REAL_SALARY)
    expect(props.employee.name).toBe("Budi")
    unmount()
  })

  it("dalam scope + izin gaji: baseSalary asli diteruskan ke EmployeeForm", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "1", roles: ["ga"], permissions: [] })
    mocks.canViewSalaryAmounts.mockResolvedValue(true)
    editMocks(employeeRow())
    const node = await EditEmployeePage({ params: Promise.resolve({ slug: "budi" }) })
    await renderNode(node)
    const props = mocks.employeeFormProps.mock.calls[0][0]
    expect(props.employee.baseSalary).toBe(REAL_SALARY)
    unmount()
  })
})
