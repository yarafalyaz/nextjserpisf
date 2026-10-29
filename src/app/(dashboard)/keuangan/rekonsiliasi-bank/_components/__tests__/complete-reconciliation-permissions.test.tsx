// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
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
  completeReconciliation: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

vi.mock("@/components/ui/shadcn/button", () => ({
  Button: ({
    children,
    disabled,
    ...rest
  }: {
    children: React.ReactNode
    disabled?: boolean
    [key: string]: unknown
  }) => (
    <button {...(rest as Record<string, unknown>)} disabled={disabled}>
      {children}
    </button>
  ),
}))

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}))

import { CompleteReconciliationButton } from "../complete-reconciliation-button"

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

describe("CompleteReconciliationButton gerbang izin UI", () => {
  it("tombol Selesaikan tampil bila dirender (halaman berizin)", () => {
    const { container, root } = mount(<CompleteReconciliationButton reconciliationId={3} />)
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Selesaikan")),
    ).toBeTruthy()
    act(() => root.unmount())
  })

  it("aksi server memakai manage_bank_reconciliation", () => {
    const actions = source("src/actions/finance.actions.ts")
    expect(actions).toMatch(
      /export async function completeReconciliation[\s\S]{0,300}?requirePermission\("manage_bank_reconciliation"\)/,
    )
  })

  it("halaman hanya merender tombol bila canWrite (draft + manage_bank_reconciliation)", () => {
    const page = source("src/app/(dashboard)/keuangan/rekonsiliasi-bank/[slug]/page.tsx")
    expect(page).toContain('userPerms.includes("manage_bank_reconciliation")')
    expect(page).toContain('recon.status === "draft"')
    expect(page).toContain("{canWrite && <CompleteReconciliationButton")
  })
})
