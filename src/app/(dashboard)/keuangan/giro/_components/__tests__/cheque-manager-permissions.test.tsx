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

vi.mock("@/actions/cheque.actions", () => ({
  createCheque: vi.fn(async () => ({ success: true })),
  deleteCheque: vi.fn(async () => ({ success: true })),
  updateChequeStatus: vi.fn(async () => ({ success: true })),
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

import { ChequeManager, type ChequeRow } from "../cheque-manager"

const CHEQUES: ChequeRow[] = [
  {
    id: 1,
    documentNo: "CHQ-0001",
    type: "giro",
    direction: "in",
    number: "G-123",
    party: "PT Uji",
    accountLabel: "1101 Kas",
    amount: 1000000,
    dueDate: "30 Okt 2026",
    status: "pending",
  },
]

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("ChequeManager gerbang izin UI", () => {
  beforeEach(() => vi.clearAllMocks())

  it("view-only: form buat + tombol Cair/Batal/Hapus tidak dirender, daftar tetap tampil", () => {
    const { container, root } = mount(
      <ChequeManager cheques={CHEQUES} accounts={[]} canCreate={false} canEdit={false} canDelete={false} />,
    )
    expect(container.querySelector("#create-cheque-btn")).toBeNull()
    expect(container.querySelector('button[aria-label="Tandai cair CHQ-0001"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Batalkan CHQ-0001"]')).toBeNull()
    expect(container.querySelector('button[aria-label="Hapus CHQ-0001"]')).toBeNull()
    expect(container.textContent).toContain("CHQ-0001")
    act(() => root.unmount())
  })

  it("berizin penuh: form buat + Cair/Batal/Hapus tampil", () => {
    const { container, root } = mount(
      <ChequeManager cheques={CHEQUES} accounts={[]} canCreate canEdit canDelete />,
    )
    expect(container.querySelector("#create-cheque-btn")).not.toBeNull()
    expect(container.querySelector('button[aria-label="Tandai cair CHQ-0001"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Batalkan CHQ-0001"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Hapus CHQ-0001"]')).not.toBeNull()
    act(() => root.unmount())
  })

  it("parsial: canEdit saja menampilkan Cair/Batal tanpa form buat dan Hapus", () => {
    const { container, root } = mount(
      <ChequeManager cheques={CHEQUES} accounts={[]} canCreate={false} canEdit canDelete={false} />,
    )
    expect(container.querySelector("#create-cheque-btn")).toBeNull()
    expect(container.querySelector('button[aria-label="Tandai cair CHQ-0001"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Hapus CHQ-0001"]')).toBeNull()
    act(() => root.unmount())
  })
})

describe("halaman giro meneruskan izin ke ChequeManager", () => {
  it("page mengambil create/edit/delete_cheques via hasPermission dan meneruskannya", () => {
    const page = source("src/app/(dashboard)/keuangan/giro/page.tsx")
    expect(page).toContain('requirePermission("view_cheques")')
    expect(page).toContain('hasPermission("create_cheques")')
    expect(page).toContain('hasPermission("edit_cheques")')
    expect(page).toContain('hasPermission("delete_cheques")')
    expect(page).toContain("canCreate={canCreate}")
    expect(page).toContain("canEdit={canEdit}")
    expect(page).toContain("canDelete={canDelete}")
  })
})

describe("ChequeManager: nominal bersen", () => {
  it("nominal giro tampil hingga sen", () => {
    const { container, root } = mount(
      <ChequeManager
        cheques={[{ ...CHEQUES[0], amount: 1_000_000.5 }]}
        accounts={[]}
        canCreate={false}
        canEdit={false}
        canDelete={false}
      />,
    )
    expect(container.textContent ?? "").toContain("1.000.000,50")
    act(() => root.unmount())
  })
})
