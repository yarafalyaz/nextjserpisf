// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

vi.mock("@/actions/project.actions", () => ({
  createProjectBudgetItem: vi.fn(async () => ({ success: true })),
  updateProjectBudgetItem: vi.fn(async () => ({ success: true })),
  deleteProjectBudgetItem: vi.fn(async () => ({ success: true })),
  lockProjectBudget: vi.fn(async () => ({ success: true })),
  setProjectContractManual: vi.fn(async () => ({ success: true })),
  setProjectContractFromQuotation: vi.fn(async () => ({ success: true })),
  proposeProjectBudgetRevision: vi.fn(async () => ({ success: true })),
  applyProjectBudgetRevision: vi.fn(async () => ({ success: true })),
  rejectProjectBudgetRevision: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))

import { ProjectBudgetEditor, type BudgetItemRow } from "../project-budget-editor"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => clearRenderedCards())

const items: BudgetItemRow[] = [
  { id: 1, projectStageId: 10, category: "material", description: "Cat dasar", qty: 2, cost: 5_000_000, sortOrder: 1 },
]
const stages = [{ id: 10, name: "Persiapan" }]

function renderEditor(over: Partial<Parameters<typeof ProjectBudgetEditor>[0]> = {}) {
  const { container, root } = renderCard(
    <ProjectBudgetEditor projectId={1} items={items} stages={stages} quotations={[{ id: 7, documentNo: "Q-001", grandTotal: 100_000_000 }]} isLocked={false} canEdit canManage pendingProposal={null} {...over} />,
  )
  const text = container.textContent ?? ""
  const found = {
    kelola: container.querySelector('[aria-label="Kelola RAB"]') !== null,
    tambah: container.querySelector('[aria-label="Tambah baris RAB"]') !== null,
    kunci: text.includes("Kunci RAB"),
    kontrakManual: container.querySelector('[aria-label="Nilai kontrak manual"]') !== null,
    proposal: container.querySelector('[aria-label="Usulan revisi menunggu keputusan"]') !== null,
  }
  unmountCard(root)
  return { text, found }
}

describe("ProjectBudgetEditor CRUD RAB (kontrak #370)", () => {
  it("draft: form tambah + kunci + kontrak tampil untuk edit+manage", () => {
    const { text, found } = renderEditor()
    expect(found.kelola).toBe(true)
    expect(found.tambah).toBe(true)
    expect(found.kunci).toBe(true)
    expect(found.kontrakManual).toBe(true)
    expect(text).toContain("Cat dasar")
    expect(text).toContain("Tambah Baris RAB")
  })

  it("terkunci: tanpa tombol kunci langsung, form menjadi usulan revisi", () => {
    const { text, found } = renderEditor({ isLocked: true })
    expect(found.tambah).toBe(true)
    expect(text).toContain("Kirim Usulan Tambah")
    expect(text).toContain("Alasan Revisi")
    expect(text).toContain("Hapus (usulan)")
  })

  it("usulan terbuka: panel keputusan hanya untuk manage", () => {
    const proposal = { logId: 9, reason: "Naik harga cat", changesJson: "[]" }
    expect(renderEditor({ isLocked: true, pendingProposal: proposal }).found.proposal).toBe(true)
    const manage = renderEditor({ isLocked: true, pendingProposal: proposal, canManage: true })
    expect(manage.text).toContain("Terapkan Revisi")
    const noManage = renderEditor({ isLocked: true, pendingProposal: proposal, canManage: false })
    expect(noManage.text).toContain("Menunggu keputusan pengelola proyek")
    expect(noManage.text).not.toContain("Terapkan Revisi")
  })

  it("tanpa izin edit/manage: editor tidak dirender", () => {
    const { found } = renderEditor({ canEdit: false, canManage: false })
    expect(found.kelola).toBe(false)
  })

  it("tanpa izin manage: tombol kunci hilang walau draft", () => {
    const { text } = renderEditor({ canManage: false })
    expect(text).not.toContain("Kunci RAB")
  })
})
