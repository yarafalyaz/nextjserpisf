// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver

import { createRoot, type Root } from "react-dom/client"
import { act, type ReactElement } from "react"

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}))

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showProcessResult: vi.fn(),
}))

vi.mock("@/lib/quick-add/registry", () => ({
  QUICK_ADD: new Proxy({}, { get: () => ({ title: "Stub", fields: [], action: vi.fn() }) }),
}))

vi.mock("@/components/ui/address-picker", () => ({
  AddressPicker: () => null,
}))

vi.mock("@/actions/vehicle.actions", () => ({ createVehicleModel: vi.fn(), updateVehicleModel: vi.fn() }))
vi.mock("@/actions/project.actions", () => ({ createTask: vi.fn(), updateTask: vi.fn() }))
vi.mock("@/actions/master.actions", () => ({ createBrand: vi.fn(), updateBrand: vi.fn() }))
vi.mock("@/actions/qc.actions", () => ({ resolveNonconformance: vi.fn() }))
vi.mock("@/actions/bank-transfer.actions", () => ({ createBankTransfer: vi.fn() }))
vi.mock("@/actions/expense-category.actions", () => ({ updateExpenseCategory: vi.fn(), deleteExpenseCategory: vi.fn() }))
vi.mock("@/actions/sales.actions", () => ({ createSalesInvoice: vi.fn(), updateSalesInvoice: vi.fn() }))
vi.mock("@/actions/credit-override.actions", () => ({
  getMyCreditOverrideStatus: vi.fn(),
  approveCreditOverride: vi.fn(),
  rejectCreditOverride: vi.fn(),
  listCreditOverrides: vi.fn(),
}))
vi.mock("@/actions/auth.actions", () => ({ updateProfile: vi.fn(), changePassword: vi.fn() }))

import { Button } from "@/components/ui/button"
import { Button as ShadButton } from "@/components/ui/shadcn/button"
import { FormActions } from "@/components/ui/form-section"
import { CalendarBoard } from "@/app/(dashboard)/kalender/_components/calendar-board"
import { NotificationDropdown } from "@/components/layout/notification-dropdown"
import { VehicleModelForm } from "@/components/forms/vehicle-model-form"
import { TaskForm } from "@/app/(dashboard)/proyek/tugas/_components/task-form"
import { BrandForm } from "@/app/(dashboard)/master/merek/_components/brand-form"
import { NonconformanceResolveForm } from "@/app/(dashboard)/produksi/qc/ncr/_components/nonconformance-resolve-form"
import { BankTransferForm } from "@/app/(dashboard)/keuangan/transfer-bank/_components/bank-transfer-form"
import { EditForm as EditExpenseCategoryForm } from "@/app/(dashboard)/master/kategori-pengeluaran/[slug]/ubah/form"
import { DeliveryOrderForm } from "@/components/forms/delivery-order-form"
import { SalesInvoiceForm } from "@/components/forms/sales-invoice-form"
import { ProfileForm } from "@/components/forms/profile-form"

let root: Root | null = null

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe("Touch targets, FormActions & A11y semantic nesting (H13 / H14 / M7)", () => {
  it("Button, ShadButton, and FormActions enforce >=44px mobile touch targets and md-up desktop breakpoints", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <div>
          <Button>Aksi</Button>
          <ShadButton size="sm">Kecil</ShadButton>
          <FormActions>
            <Button type="button">Batal</Button>
          </FormActions>
        </div>,
      )
    })

    const buttons = container.querySelectorAll("button")
    expect(buttons[0].className).toContain("min-h-11")
    expect(buttons[0].className).toContain("md:min-h-9")
    expect(buttons[1].className).toContain("min-h-11")
    expect(buttons[1].className).toContain("md:min-h-8")

    const bar = buttons[2].parentElement!
    expect(bar.className).toContain("md:static")
    expect(bar.className).not.toContain("sm:static")
  })

  it("CalendarBoard separates day-selection button from event Link chips (no Link inside button/[role=button])", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => {
      root!.render(
        <CalendarBoard
          weeks={[
            [
              {
                key: "2026-11-18",
                dayNumber: 18,
                inMonth: true,
                isToday: true,
                fullDateLabel: "18 November 2026",
              },
            ],
          ]}
          events={[
            {
              id: "ev-1",
              dayKey: "2026-11-18",
              kind: "invoice",
              label: "INV-001",
              amount: 100000,
              href: "/penjualan/faktur/1",
            },
          ]}
          availableKinds={["invoice"]}
          canViewArSummary={false}
          canViewApSummary={false}
          defaultSelectedDayKey="2026-11-18"
        />,
      )
    })

    const dayBtn = container.querySelector('button[aria-pressed="true"]')
    expect(dayBtn).not.toBeNull()

    const links = Array.from(container.querySelectorAll("a"))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.closest('button, [role="button"]')).toBeNull()
    }
  })

  it("NotificationDropdown uses role='status' while loading and removes aria-disabled on read items", async () => {
    let resolveNotifications!: (value: unknown) => void
    let callCount = 0
    global.fetch = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ notifications: [], unreadCount: 1 }),
        })
      }
      return new Promise((resolve) => {
        resolveNotifications = resolve
      })
    }) as never

    const container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<NotificationDropdown />)
    })

    const toggleBtn = container.querySelector("#notification-btn") as HTMLButtonElement
    expect(toggleBtn).not.toBeNull()

    act(() => {
      toggleBtn.click()
    })

    const loadingStatus = container.querySelector('[role="status"]')
    expect(loadingStatus).not.toBeNull()
    expect(loadingStatus?.textContent).toContain("Memuat notifikasi...")

    await act(async () => {
      resolveNotifications({
        ok: true,
        json: async () => ({
          notifications: [
            {
              id: 7,
              title: "Faktur Dibayar",
              body: "/penjualan/faktur/7",
              type: "info",
              readAt: "2026-11-17T08:00:00Z",
              createdAt: "2026-11-17T08:00:00Z",
            },
          ],
          unreadCount: 0,
        }),
      })
      await Promise.resolve()
    })

    const notifBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Faktur Dibayar"),
    )
    expect(notifBtn).toBeDefined()
    expect(notifBtn?.getAttribute("aria-disabled")).toBeNull()
  })
})

function renderForm(element: ReactElement): HTMLElement {
  if (root) {
    act(() => root!.unmount())
    root = null
  }
  document.body.replaceChildren()
  const container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root!.render(element)
  })
  return container
}

function assertFormActionsFooter(container: HTMLElement, expectedLabels: string[]) {
  const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement | null
  expect(submitBtn).not.toBeNull()
  const bar = submitBtn!.parentElement!
  expect(bar.className).toContain("sticky")
  expect(bar.className).toContain("md:static")
  expect(bar.className).not.toContain("sm:static")

  const footerButtons = Array.from(bar.querySelectorAll("button"))
  expect(footerButtons.map((b) => b.textContent?.trim())).toEqual(expectedLabels)
  for (const btn of footerButtons) {
    expect(btn.className).toContain("w-full")
    expect(btn.className).toContain("md:w-auto")
    expect(btn.className).toContain("min-h-11")
    expect(btn.className).toContain("md:min-h-9")
  }
  expect(container.textContent ?? "").not.toMatch(/[^\s]\s*\u2014|\u2014\s*[^\s]/)
  return bar
}

describe("Standalone forms FormActions, touch-target & R-02 regression", () => {
  it("VehicleModelForm renders FormActions + responsive single-form vs multi-card wrapper", () => {
    const createContainer = renderForm(<VehicleModelForm brands={[{ id: 1, name: "Toyota" }]} />)
    const createForm = createContainer.querySelector("form")!
    expect(createForm.className).toContain("sm:bg-surface")
    expect(createForm.className).toContain("sm:rounded-xl")
    expect(createForm.className).toContain("sm:p-6")
    assertFormActionsFooter(createContainer, ["Batal", "Simpan"])

    const editContainer = renderForm(
      <VehicleModelForm brands={[{ id: 1, name: "Toyota" }]} model={{ id: 3, name: "Avanza", vehicleBrandId: 1 }} />,
    )
    const editForm = editContainer.querySelector("form")!
    expect(editForm.className).toContain("bg-surface")
    expect(editForm.className).toContain("p-4 sm:p-6")
    assertFormActionsFooter(editContainer, ["Batal", "Perbarui"])
  })

  it("TaskForm and BrandForm use FormActions with single-form responsive outer wrappers", () => {
    const taskContainer = renderForm(
      <TaskForm projects={[{ id: 1, name: "Proyek A" }]} employees={[{ id: 2, name: "Budi" }]} />,
    )
    expect(taskContainer.querySelector("form")!.className).toContain("sm:bg-surface")
    assertFormActionsFooter(taskContainer, ["Batal", "Simpan"])

    const brandContainer = renderForm(
      <BrandForm
        categories={[{ id: 1, name: "Oli" }]}
        initialCategories={[{ id: 1, name: "Oli" }]}
      />,
    )
    expect(brandContainer.querySelector("form")!.className).toContain("sm:bg-surface")
    assertFormActionsFooter(brandContainer, ["Batal", "Simpan"])
    const removeChipBtn = brandContainer.querySelector('button[aria-label="Hapus kategori Oli"]')
    expect(removeChipBtn?.className).toContain("before:-inset-3")
  })

  it("NonconformanceResolveForm, BankTransferForm, and EditExpenseCategoryForm use FormActions and preserve desktop layout", () => {
    const ncrContainer = renderForm(
      <NonconformanceResolveForm ncrId={1} currentStatus="open" canManage />,
    )
    assertFormActionsFooter(ncrContainer, ["Simpan"])

    const transferContainer = renderForm(
      <BankTransferForm
        accounts={[{ id: 1, code: "1101", name: "BCA" }]}
        expenseAccounts={[{ id: 2, code: "6101", name: "Biaya Bank" }]}
      />,
    )
    const transferBar = assertFormActionsFooter(transferContainer, ["Batal", "Simpan & Posting"])
    const hint = transferBar.querySelector("p")
    expect(hint?.textContent).toContain("Jurnal:")
    expect(hint?.className).toContain("md:mr-auto")
    expect(hint?.className).toContain("order-last")
    expect(hint?.className).toContain("md:order-none")

    const expCatContainer = renderForm(
      <EditExpenseCategoryForm
        category={{ id: 5, slug: "operasional", name: "operasional", label: "Operasional", sortOrder: 1, isActive: true }}
      />,
    )
    const expCatBar = assertFormActionsFooter(expCatContainer, ["Hapus", "Batal", "Perbarui"])
    expect(expCatBar.querySelector("button")?.className).toContain("md:mr-auto")
  })

  it("DeliveryOrderForm and SalesInvoiceForm render FormActions footers with mobile touch targets", () => {
    const doContainer = renderForm(
      <DeliveryOrderForm salesOrders={[{ id: 1, documentNo: "SO-001", customer: { name: "PT Maju" } }]} />,
    )
    assertFormActionsFooter(doContainer, ["Batal", "Simpan"])

    const invContainer = renderForm(
      <SalesInvoiceForm customers={[{ id: 1, name: "PT Maju" }]} salesOrders={[]} />,
    )
    assertFormActionsFooter(invContainer, ["Batal", "Simpan"])
  })

  it("ProfileForm keeps two non-sticky form footers with >=44px mobile touch targets", () => {
    const container = renderForm(
      <ProfileForm user={{ id: 1, name: "Admin", email: "admin@example.com", avatar: null }} roles={["Admin"]} />,
    )
    const forms = Array.from(container.querySelectorAll("form"))
    expect(forms).toHaveLength(2)

    const submitButtons = Array.from(container.querySelectorAll('button[type="submit"]'))
    expect(submitButtons).toHaveLength(2)
    for (const btn of submitButtons) {
      expect(btn.parentElement?.className).not.toContain("sticky")
      expect(btn.className).toContain("min-h-11")
      expect(btn.className).toContain("md:min-h-9")
      expect(btn.className).toContain("w-full")
      expect(btn.className).toContain("md:w-auto")
    }
    expect(container.textContent ?? "").not.toMatch(/[^\s]\s*\u2014|\u2014\s*[^\s]/)
  })

  it("summary/detail blocks (invoice-items-editor & master/merek detail) do not adopt FormActions", () => {
    const rootDir = process.cwd()
    const editorSrc = fs.readFileSync(path.join(rootDir, "src/components/ui/invoice-items-editor.tsx"), "utf8")
    const brandDetailSrc = fs.readFileSync(path.join(rootDir, "src/app/(dashboard)/master/merek/[slug]/page.tsx"), "utf8")
    expect(editorSrc).not.toContain("FormActions")
    expect(brandDetailSrc).not.toContain("FormActions")
  })
})
