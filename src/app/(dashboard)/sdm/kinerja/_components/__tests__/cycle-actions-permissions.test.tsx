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

vi.mock("@/actions/performance.actions", () => ({
  createPerformanceCycle: vi.fn(async () => ({ success: true })),
  finalizeReview: vi.fn(async () => ({ success: true })),
  setPerformanceCycleStatus: vi.fn(async () => ({ success: true })),
  submitManagerReview: vi.fn(async () => ({ success: true })),
  submitSelfReview: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { CycleStatusButton, ManagerReviewForm, SelfReviewForm } from "../cycle-actions"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

const btn = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) ?? null

describe("cycle-actions gerbang izin UI (edit_performance)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tanpa canEdit: CycleStatusButton + ManagerReviewForm hilang, SelfReviewForm tetap tampil", () => {
    const a = mount(<CycleStatusButton cycleId={1} status="draft" canEdit={false} />)
    expect(a.container.querySelector("button")).toBeNull()
    act(() => a.root.unmount())

    const b = mount(<ManagerReviewForm cycleId={1} employeeId={2} canEdit={false} />)
    expect(b.container.querySelector("form")).toBeNull()
    expect(btn(b.container, "Simpan Ulasan")).toBeNull()
    expect(btn(b.container, "Finalisasi")).toBeNull()
    act(() => b.root.unmount())

    // SelfReviewForm sengaja TIDAK digerbang edit_performance (view_performance sah).
    const c = mount(<SelfReviewForm cycleId={1} employeeId={2} />)
    expect(btn(c.container, "Nilai Diri")).not.toBeNull()
    act(() => c.root.unmount())
  })

  it("dengan canEdit: CycleStatusButton + ManagerReviewForm tampil", () => {
    const a = mount(<CycleStatusButton cycleId={1} status="draft" canEdit />)
    expect(btn(a.container, "Aktifkan")).not.toBeNull()
    act(() => a.root.unmount())

    const b = mount(<ManagerReviewForm cycleId={1} employeeId={2} canEdit />)
    expect(btn(b.container, "Simpan Ulasan")).not.toBeNull()
    expect(btn(b.container, "Finalisasi")).not.toBeNull()
    act(() => b.root.unmount())
  })

  it("halaman meneruskan edit_performance sebagai canEdit", () => {
    const list = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/kinerja/page.tsx"),
      "utf8",
    )
    expect(list).toContain('hasPermission("edit_performance")')
    expect(list).toContain("canEdit={canEdit}")

    const detail = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/kinerja/[slug]/page.tsx"),
      "utf8",
    )
    expect(detail).toContain('hasPermission("edit_performance")')
    expect(detail).toContain("canEdit={canEdit}")
    // SelfReviewForm tidak menerima canEdit di halaman detail.
    expect(detail).toContain("<SelfReviewForm cycleId={cycle.id} employeeId={emp.id} />")
  })
})
