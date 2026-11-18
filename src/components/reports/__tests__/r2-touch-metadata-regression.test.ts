// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import React, { act, type ReactElement, type ReactNode } from "react"
import type { Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  clearRenderedCards,
  renderCard,
  renderPageNode,
  setFieldValue,
  unmountCard,
} from "./card-test-utils"
import { setupJsdomTableStubs } from "@/components/ui/__tests__/data-table-test-utils"

setupJsdomTableStubs()

const mocks = vi.hoisted(() => ({
  findManyRecurring: vi.fn(),
  findManyHolidays: vi.fn(),
  findManyDeptHolidays: vi.fn(),
  findManySchedules: vi.fn(),
  capturedRecurringRows: [] as Array<{
    id: number
    nextRunDate: string
    lastRunAt: string | null
  }>,
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode
    href: string
    [key: string]: unknown
  }) => React.createElement("a", { href, ...rest }, children),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: vi.fn(async () => ({})),
  requireAnyPermission: vi.fn(async () => ({})),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    asset: { findMany: vi.fn(async () => []) },
    assetTransfer: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
    recurringTransaction: { findMany: mocks.findManyRecurring },
    holiday: { findMany: mocks.findManyHolidays },
    departmentHoliday: { findMany: mocks.findManyDeptHolidays },
    workSchedule: { findMany: mocks.findManySchedules },
  },
}))

vi.mock("@/lib/reports/recurring-due-queue-data", () => ({
  getRecurringDueQueue: vi.fn(async () => ({ total: 0, items: [] })),
}))

vi.mock("@/components/reports/recurring-due-queue-card", () => ({
  RecurringDueQueueCard: () => null,
}))

vi.mock("@/app/(dashboard)/pengaturan/transaksi-berulang/_components/recurring-transaction-table", () => ({
  RecurringTransactionTable: ({
    data,
  }: {
    data: Array<{ id: number; nextRunDate: string; lastRunAt: string | null }>
  }) => {
    mocks.capturedRecurringRows = data
    return React.createElement("div", { "data-testid": "recurring-table" }, String(data.length))
  },
}))

vi.mock("@/components/forms/asset-transfer-form", () => ({
  AssetTransferForm: () => null,
}))

vi.mock("@/components/ui/breadcrumbs", () => ({
  AppBreadcrumbs: () => null,
}))

vi.mock("@/components/auth/can-create", () => ({
  CanCreate: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
}))

vi.mock("@/actions/hrm.actions", () => ({
  createHoliday: vi.fn(),
  updateHoliday: vi.fn(),
  createDepartmentHoliday: vi.fn(),
  updateDepartmentHoliday: vi.fn(),
  createWorkSchedule: vi.fn(),
  updateWorkSchedule: vi.fn(),
  deleteHoliday: vi.fn(),
  deleteDepartmentHoliday: vi.fn(),
  deleteWorkSchedule: vi.fn(),
}))

vi.mock("@/actions/auth.actions", () => ({
  updateUserRoles: vi.fn(async () => ({ success: true })),
  toggleUserActive: vi.fn(async () => ({ success: true })),
  updateUserWarehouses: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/actions/whatsapp-log.actions", () => ({
  recordWhatsappLinkOpened: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/actions/invoice-collection.actions", () => ({
  createInvoiceCollectionFollowUp: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/actions/manufacturing.actions", () => ({
  closeWorkOrder: vi.fn(async () => ({ success: true })),
  closeProductionOrder: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { metadata as createAssetTransferMetadata } from "@/app/(dashboard)/aset/transfer/tambah/page"
import { metadata as editAssetTransferMetadata } from "@/app/(dashboard)/aset/transfer/[slug]/ubah/page"
import RecurringTransactionsPage from "@/app/(dashboard)/pengaturan/transaksi-berulang/page"
import WorkCalendarPage from "@/app/(dashboard)/sdm/kalender-kerja/page"
import { WorkScheduleForm } from "@/app/(dashboard)/sdm/kalender-kerja/_components/work-calendar-forms"
import { UserTable } from "@/app/(dashboard)/pengaturan/pengguna/_components/user-table"
import { StatementOptions } from "@/components/reports/statement-options"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { WorkshopCloseoutQueueCard } from "@/components/reports/workshop-closeout-queue-card"
import { CollectionQueueCard } from "@/components/reports/collection-queue-card"
import { ReportCatalog } from "@/components/reports/report-catalog"
import { PermissionMatrix } from "@/app/(dashboard)/pengaturan/peran/[slug]/modul/_components/permission-matrix"
import { UserAccessPanel } from "@/app/(dashboard)/pengaturan/pengguna/[slug]/_components/user-access-panel"
import { DEFAULT_STATEMENT_OPTIONS } from "@/lib/reports/statement-display"
import { buildWorkshopCloseoutQueue } from "@/lib/reports/workshop-closeout-queue"
import { buildCollectionQueue } from "@/lib/reports/collection-queue"
import { closeoutJobInput } from "./workshop-closeout-test-fixtures"
import { formatDate } from "@/lib/utils/format"

let roots: Root[] = []

function mount(element: ReactElement): HTMLElement {
  const { container, root } = renderCard(element)
  roots.push(root)
  return container
}

function assertTouchAndPointer(el: Element | null, label: string) {
  expect(el, `${label} must exist`).not.toBeNull()
  const cls = (el as HTMLElement).className
  expect(cls, `${label} missing min-h-11`).toContain("min-h-11")
  expect(cls, `${label} missing cursor-pointer`).toContain("cursor-pointer")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.capturedRecurringRows = []
})

afterEach(() => {
  for (const root of roots) {
    unmountCard(root)
  }
  roots = []
  clearRenderedCards()
})

describe("Round-2 M4: asset-transfer metadata & recurring WIB formatting", () => {
  it("asset transfer tambah & ubah export Asset Transfer metadata titles (not Stok)", () => {
    expect(createAssetTransferMetadata.title).toBe("Tambah Transfer Aset")
    expect(editAssetTransferMetadata.title).toBe("Ubah Transfer Aset")
  })

  it("RecurringTransactionsPage formats nextRunDate & lastRunAt via formatDate (Asia/Jakarta WIB)", async () => {
    // 2026-10-20T18:30:00Z = 2026-10-21 01:30 WIB (crosses UTC midnight into Oct 21 in Jakarta)
    const nextRun = new Date("2026-10-20T18:30:00.000Z")
    const lastRun = new Date("2026-10-15T17:00:00.000Z") // 2026-10-16 00:00 WIB

    mocks.findManyRecurring.mockResolvedValue([
      {
        id: 1,
        slug: "sewa-bulanan",
        name: "Sewa Bulanan",
        type: "expense",
        frequency: "monthly",
        interval: 1,
        nextRunDate: nextRun,
        lastRunAt: lastRun,
        lastResult: "Sukses",
        runCount: 3,
        isActive: true,
      },
      {
        id: 2,
        slug: "penyusutan-alat",
        name: "Penyusutan Alat",
        type: "journal",
        frequency: "monthly",
        interval: 1,
        nextRunDate: nextRun,
        lastRunAt: null,
        lastResult: null,
        runCount: 0,
        isActive: false,
      },
    ])

    const node = await RecurringTransactionsPage()
    const { root } = renderPageNode(node)
    roots.push(root)

    expect(mocks.capturedRecurringRows).toHaveLength(2)
    expect(mocks.capturedRecurringRows[0].nextRunDate).toBe(formatDate(nextRun))
    expect(mocks.capturedRecurringRows[0].nextRunDate).toBe("21 Oktober 2026")
    expect(mocks.capturedRecurringRows[0].lastRunAt).toBe(formatDate(lastRun))
    expect(mocks.capturedRecurringRows[0].lastRunAt).toBe("16 Oktober 2026")
    expect(mocks.capturedRecurringRows[1].lastRunAt).toBeNull()

    const pageSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/pengaturan/transaksi-berulang/page.tsx"),
      "utf8",
    )
    expect(pageSource).not.toContain(".toLocaleDateString(")
    expect(pageSource).toContain("formatDate(")
  })
})

describe("Round-2 L1: FormActions & 44px mobile touch targets + cursor-pointer", () => {
  it("WorkScheduleForm adopts sticky FormActions footer and wraps native checkboxes in 44px touch labels", () => {
    const createContainer = mount(React.createElement(WorkScheduleForm))
    const submitCreate = createContainer.querySelector('button[type="submit"]') as HTMLButtonElement | null
    expect(submitCreate).not.toBeNull()
    const createBar = submitCreate!.parentElement!
    expect(createBar.className).toContain("sticky")
    expect(createBar.className).toContain("md:static")
    expect(submitCreate!.className).toContain("w-full")
    expect(submitCreate!.className).toContain("md:w-auto")
    expect(submitCreate!.className).toContain("min-h-11")
    expect(submitCreate!.className).toContain("md:min-h-9")

    const checkboxes = Array.from(createContainer.querySelectorAll('input[type="checkbox"]'))
    // 1 isActive + 7 DAY_NAMES checkboxes
    expect(checkboxes).toHaveLength(8)
    for (const box of checkboxes) {
      const label = box.closest("label")
      expect(label, "checkbox must be wrapped in clickable <label>").not.toBeNull()
      assertTouchAndPointer(label, `checkbox wrapper (${(box as HTMLInputElement).name})`)
      expect(label!.className).toContain("md:min-h-9")
    }

    const editContainer = mount(
      React.createElement(WorkScheduleForm, {
        schedule: {
          id: 9,
          name: "Shift Reguler",
          workDays: "1,2,3,4,5",
          startTime: "08:00",
          endTime: "17:00",
          isActive: true,
        },
      }),
    )
    const editSubmit = editContainer.querySelector('button[type="submit"]')!
    const editBar = editSubmit.parentElement!
    expect(editBar.className).toContain("sticky")
    expect(editBar.className).toContain("md:static")
    const footerButtons = Array.from(editBar.querySelectorAll("button"))
    expect(footerButtons.map((b) => b.textContent?.trim())).toEqual(["Batal", "Perbarui"])
    for (const btn of footerButtons) {
      expect(btn.className).toContain("w-full")
      expect(btn.className).toContain("md:w-auto")
      expect(btn.className).toContain("min-h-11")
      expect(btn.className).toContain("md:min-h-9")
    }

    const formsSource = fs.readFileSync(
      path.join(process.cwd(), "src/app/(dashboard)/sdm/kalender-kerja/_components/work-calendar-forms.tsx"),
      "utf8",
    )
    expect(formsSource).toContain("<FormActions>")
  })

  it("WorkCalendarPage gives all three Ubah links 44px mobile touch targets and cursor-pointer", async () => {
    mocks.findManyHolidays.mockResolvedValue([
      { id: 1, name: "Tahun Baru", date: new Date("2026-01-01T00:00:00Z"), description: null },
    ])
    mocks.findManyDeptHolidays.mockResolvedValue([
      { id: 2, name: "Cuti Bengkel", date: new Date("2026-02-02T00:00:00Z"), department: { name: "Bengkel" } },
    ])
    mocks.findManySchedules.mockResolvedValue([
      { id: 3, name: "Reguler", workDays: "1,2,3,4,5", startTime: "08:00", endTime: "17:00", isActive: true },
    ])

    const node = await WorkCalendarPage({ searchParams: Promise.resolve({}) })
    const { container, root } = renderPageNode(node)
    roots.push(root)

    const editLinks = Array.from(container.querySelectorAll('a[href$="/ubah"]'))
    expect(editLinks).toHaveLength(3)
    for (const link of editLinks) {
      expect(link.textContent?.trim()).toBe("Ubah")
      expect(link.className).toContain("inline-flex")
      expect(link.className).toContain("items-center")
      assertTouchAndPointer(link, `WorkCalendarPage Ubah link (${link.getAttribute("href")})`)
      expect(link.className).toContain("md:min-h-8")
    }
  })

  it("UserTable row edit link has min-h-11 min-w-11 md:min-h-8 md:min-w-8 and cursor-pointer", () => {
    const container = mount(
      React.createElement(UserTable, {
        data: [
          {
            id: 7,
            slug: "budi",
            name: "Budi",
            email: "budi@example.com",
            isActive: true,
            roles: [{ id: 1, name: "admin" }],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
    )
    const editLink = container.querySelector('a[aria-label="Ubah pengguna Budi"]')
    assertTouchAndPointer(editLink, "UserTable row edit link")
    expect(editLink!.className).toContain("min-w-11")
    expect(editLink!.className).toContain("md:min-h-8")
    expect(editLink!.className).toContain("md:min-w-8")
    expect(editLink!.className).not.toMatch(/\bsize-8\b/)
  })

  it("StatementOptions and ReportPeriodFilter preset buttons & triggers have min-h-11 and cursor-pointer", () => {
    const rangeOpts = mount(
      React.createElement(StatementOptions, {
        basePath: "/laporan/laba-rugi",
        defaultStartDate: "2026-10-01",
        defaultEndDate: "2026-10-31",
        currentOptions: DEFAULT_STATEMENT_OPTIONS,
        showPercentColumn: true,
      }),
    )
    const rangeButtons = ["Bulan Ini", "Bulan Lalu", "Kuartal Ini", "Tahun Ini (YTD)"]
    for (const text of rangeButtons) {
      const btn = Array.from(rangeOpts.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) ?? null
      assertTouchAndPointer(btn, `StatementOptions preset "${text}"`)
    }
    const trigger = Array.from(rangeOpts.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Parameter Tambahan"),
    ) ?? null
    assertTouchAndPointer(trigger, "StatementOptions Parameter Tambahan trigger")

    const asOfOpts = mount(
      React.createElement(StatementOptions, {
        basePath: "/laporan/neraca",
        defaultStartDate: "2026-10-31",
        defaultEndDate: "2026-10-31",
        currentOptions: DEFAULT_STATEMENT_OPTIONS,
        singleDate: true,
      }),
    )
    for (const text of ["Hari Ini", "Akhir Bulan Lalu"]) {
      const btn = Array.from(asOfOpts.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) ?? null
      assertTouchAndPointer(btn, `StatementOptions singleDate preset "${text}"`)
    }

    const periodRange = mount(
      React.createElement(ReportPeriodFilter, {
        basePath: "/laporan/mutasi-stok",
        mode: "range",
        defaultStartDate: "2026-10-01",
        defaultEndDate: "2026-10-31",
        toggle: { param: "nol", label: "Sembunyikan nol", checked: false },
      }),
    )
    for (const text of rangeButtons) {
      const btn = Array.from(periodRange.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) ?? null
      assertTouchAndPointer(btn, `ReportPeriodFilter preset "${text}"`)
    }
    const toggleLabel = periodRange.querySelector('label[for="opsi-nol"]')
    assertTouchAndPointer(toggleLabel, "ReportPeriodFilter toggle label")

    const periodAsOf = mount(
      React.createElement(ReportPeriodFilter, {
        basePath: "/laporan/aset-tetap",
        mode: "as-of",
        defaultStartDate: "2026-10-31",
      }),
    )
    for (const text of ["Hari Ini", "Akhir Bulan Lalu"]) {
      const btn = Array.from(periodAsOf.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) ?? null
      assertTouchAndPointer(btn, `ReportPeriodFilter as-of preset "${text}"`)
    }
  })

  it("WorkshopCloseoutQueueCard & CollectionQueueCard filter chips have min-h-11 + cursor-pointer without unlayered filter-chip cap", () => {
    const asOf = new Date(2026, 9, 24, 0, 0)
    const queue = buildWorkshopCloseoutQueue({ jobs: [closeoutJobInput(asOf, {})], asOf })
    const closeoutContainer = mount(
      React.createElement(WorkshopCloseoutQueueCard, {
        queue,
        canCloseWorkOrder: true,
        canCloseProductionOrder: true,
      }),
    )
    const ageGroup = closeoutContainer.querySelector('[role="group"][aria-label="Filter ember umur"]')!
    const ageButtons = Array.from(ageGroup.querySelectorAll("button"))
    expect(ageButtons.length).toBeGreaterThanOrEqual(2)
    for (const btn of ageButtons) {
      assertTouchAndPointer(btn, `WorkshopCloseoutQueueCard chip "${btn.textContent?.trim()}"`)
      expect(btn.className).not.toContain("filter-chip")
    }

    const colQueue = buildCollectionQueue(
      [
        {
          invoiceId: 1,
          documentNo: "INV-0001",
          status: "posted",
          deletedAt: null,
          date: new Date(Date.UTC(2026, 9, 1)),
          dueDate: new Date(Date.UTC(2026, 9, 20)),
          grandTotal: 1_000_000,
          paidAmount: 0,
          customerId: 1,
          customerName: "PT Maju",
          customerPhone: null,
          contactPerson: null,
        },
      ],
      [],
      [],
      { now: asOf },
    )
    const colContainer = mount(
      React.createElement(CollectionQueueCard, {
        rows: colQueue.rows,
        summary: colQueue.summary,
        canCreateExchange: false,
        canFollowUp: false,
      }),
    )
    const levelGroup = colContainer.querySelector('[role="group"][aria-label="Filter tingkat pengingat"]')!
    const levelButtons = Array.from(levelGroup.querySelectorAll("button"))
    expect(levelButtons.length).toBeGreaterThanOrEqual(2)
    for (const btn of levelButtons) {
      assertTouchAndPointer(btn, `CollectionQueueCard chip "${btn.textContent?.trim()}"`)
      expect(btn.className).not.toContain("filter-chip")
    }
  })

  it("ReportCatalog category buttons & Reset button have min-h-11 and cursor-pointer", () => {
    const container = mount(
      React.createElement(ReportCatalog, {
        categories: [
          {
            key: "keuangan",
            label: "Keuangan",
            icon: React.createElement("span", null, "K"),
            reports: [
              {
                href: "/laporan/laba-rugi",
                label: "Laba Rugi",
                desc: "Menampilkan pendapatan dan beban",
                icon: React.createElement("span", null, "L"),
              },
            ],
          },
          {
            key: "stok",
            label: "Stok",
            icon: React.createElement("span", null, "S"),
            reports: [
              {
                href: "/laporan/valuasi-stok",
                label: "Valuasi Stok",
                desc: "Menampilkan nilai stok",
                icon: React.createElement("span", null, "V"),
              },
            ],
          },
        ],
      }),
    )

    const navButtons = Array.from(container.querySelectorAll('nav[aria-label="Kategori laporan"] button'))
    expect(navButtons).toHaveLength(2)
    for (const btn of navButtons) {
      assertTouchAndPointer(btn, `ReportCatalog nav "${btn.textContent?.trim()}"`)
    }

    act(() => {
      setFieldValue(container, 'input[type="search"]', "laba")
    })
    const resetBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Reset",
    ) ?? null
    assertTouchAndPointer(resetBtn, "ReportCatalog Reset button")
  })

  it("PermissionMatrix & UserAccessPanel controls have min-h-11 and cursor-pointer", () => {
    const matrixContainer = mount(
      React.createElement(PermissionMatrix, {
        action: vi.fn(async () => {}),
        roleName: "kasir",
        checkedPermissionIds: [1],
        missingPermissionKeys: [],
        modules: [
          {
            key: "sales",
            name: "Penjualan",
            route: "/penjualan",
            icon: null,
            columns: ["view", "create"],
            rows: [
              {
                resource: "sales_invoices",
                label: "Faktur Penjualan",
                cells: [
                  { verb: "view", permissionKey: "view_sales_invoices", permissionId: 1 },
                  { verb: "create", permissionKey: "create_sales_invoices", permissionId: 2 },
                ],
              },
            ],
          },
        ],
      }),
    )

    const toggleAllBtn = Array.from(matrixContainer.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("modul"),
    ) ?? null
    assertTouchAndPointer(toggleAllBtn, "PermissionMatrix toggle module button")

    const searchInput = matrixContainer.querySelector('input[type="search"]')
    expect(searchInput?.className).toContain("h-11")

    const checkboxes = Array.from(matrixContainer.querySelectorAll('input[type="checkbox"]'))
    expect(checkboxes).toHaveLength(3) // 1 row select-all + 2 permission cells
    for (const cb of checkboxes) {
      const label = cb.closest("label")
      expect(label).not.toBeNull()
      assertTouchAndPointer(label, `PermissionMatrix checkbox wrapper`)
    }

    const panelContainer = mount(
      React.createElement(UserAccessPanel, {
        userId: 5,
        isActive: true,
        roles: [
          { id: 1, name: "admin" },
          { id: 2, name: "warehouse" },
        ],
        currentRoleIds: [1],
        warehouses: [
          { id: 10, name: "Gudang Utama" },
          { id: 11, name: "Gudang Cabang" },
        ],
        currentWarehouseIds: [10],
        allWarehouseAccess: false,
      }),
    )

    const roleButtons = Array.from(
      panelContainer.querySelectorAll('[role="group"][aria-label="Peran pengguna"] button'),
    )
    expect(roleButtons).toHaveLength(2)
    for (const btn of roleButtons) {
      assertTouchAndPointer(btn, `UserAccessPanel role "${btn.textContent?.trim()}"`)
    }

    const whButtons = Array.from(
      panelContainer.querySelectorAll('[role="group"][aria-label="Akses gudang pengguna"] button'),
    )
    expect(whButtons).toHaveLength(2)
    for (const btn of whButtons) {
      assertTouchAndPointer(btn, `UserAccessPanel warehouse "${btn.textContent?.trim()}"`)
    }
  })
})
