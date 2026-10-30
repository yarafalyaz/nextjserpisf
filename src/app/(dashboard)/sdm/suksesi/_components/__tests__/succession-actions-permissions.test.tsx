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

vi.mock("@/actions/succession.actions", () => ({
  removeSuccessorCandidate: vi.fn(async () => ({ success: true })),
  setPositionCritical: vi.fn(async () => ({ success: true })),
  upsertSuccessorCandidate: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { CriticalToggle, RemoveSuccessorButton } from "../succession-actions"

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

describe("succession-actions gerbang izin UI (edit_succession/delete_succession)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tanpa izin: CriticalToggle + Hapus kandidat hilang", () => {
    const a = mount(<CriticalToggle positionId={1} isCritical={false} canEdit={false} />)
    expect(btn(a.container, "Jadikan Kritis")).toBeNull()
    act(() => a.root.unmount())

    const b = mount(<RemoveSuccessorButton id={1} canDelete={false} />)
    expect(btn(b.container, "Hapus")).toBeNull()
    act(() => b.root.unmount())
  })

  it("dengan izin: kedua kontrol tampil", () => {
    const a = mount(<CriticalToggle positionId={1} isCritical={false} canEdit />)
    expect(btn(a.container, "Jadikan Kritis")).not.toBeNull()
    act(() => a.root.unmount())

    const b = mount(<RemoveSuccessorButton id={1} canDelete />)
    expect(btn(b.container, "Hapus")).not.toBeNull()
    act(() => b.root.unmount())
  })

  it("halaman meneruskan edit_succession/delete_succession sebagai canEdit/canDelete", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/suksesi/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("edit_succession")')
    expect(page).toContain('hasPermission("delete_succession")')
    expect(page).toContain("canEdit={canEdit}")
    expect(page).toContain("canDelete={canDelete}")
  })
})
