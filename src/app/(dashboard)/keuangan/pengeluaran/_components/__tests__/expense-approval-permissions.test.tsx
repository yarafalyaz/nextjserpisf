// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

vi.mock("next/navigation", () => ({
  useRouter() {
    return { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }
  },
}))

vi.mock("@/actions/finance.actions", () => ({
  approveExpense: vi.fn(async () => ({ success: true })),
  rejectExpense: vi.fn(async () => ({ success: true })),
  markExpensePaid: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    isDisabled,
    ...rest
  }: {
    children: React.ReactNode
    isDisabled?: boolean
    [key: string]: unknown
  }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>
      {children}
    </button>
  ),
}))

import { ExpenseApprovalActions } from "../expense-approval-actions"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function buttonByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null
}

describe("ExpenseApprovalActions gerbang izin UI (approve_expenses)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only status draft: Setujui/Tolak hilang, chip status tetap tampil", () => {
    const { container, root } = mount(<ExpenseApprovalActions status="draft" id={7} canApprove={false} />)
    expect(buttonByText(container, "Setujui")).toBeNull()
    expect(buttonByText(container, "Tolak")).toBeNull()
    expect(container.textContent).toContain("Status:")
    act(() => root.unmount())
  })

  it("view-only status approved: Tandai Dibayar hilang", () => {
    const { container, root } = mount(<ExpenseApprovalActions status="approved" id={7} canApprove={false} />)
    expect(buttonByText(container, "Tandai Dibayar")).toBeNull()
    act(() => root.unmount())
  })

  it("berizin: Setujui/Tolak tampil pada draft, Tandai Dibayar pada approved", () => {
    const draft = mount(<ExpenseApprovalActions status="draft" id={7} canApprove />)
    expect(buttonByText(draft.container, "Setujui")).not.toBeNull()
    expect(buttonByText(draft.container, "Tolak")).not.toBeNull()
    act(() => draft.root.unmount())

    const approved = mount(<ExpenseApprovalActions status="approved" id={7} canApprove />)
    expect(buttonByText(approved.container, "Tandai Dibayar")).not.toBeNull()
    act(() => approved.root.unmount())
  })

  it("halaman meneruskan approve_expenses sebagai canApprove", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/keuangan/pengeluaran/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("approve_expenses")')
    expect(page).toContain("canApprove={canApproveExpenses}")
  })
})
