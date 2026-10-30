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

vi.mock("@/actions/recruitment.actions", () => ({
  hireApplicant: vi.fn(async () => ({ success: true, employeeNo: "E-1" })),
  moveApplicantStage: vi.fn(async () => ({ success: true })),
  setVacancyStatus: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/utils/toast", () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}))

import { ApplicantStageSelect, HireButton, VacancyStatusButton } from "../applicant-actions"

function mount(node: React.ReactNode): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

describe("applicant-actions gerbang izin UI (edit_recruitments)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("tanpa canEdit: status lowongan + tahapan + Terima hilang, label tahapan tampil", () => {
    const a = mount(<VacancyStatusButton vacancyId={1} status="draft" canEdit={false} />)
    expect(a.container.querySelector("button")).toBeNull()
    act(() => a.root.unmount())

    const b = mount(<ApplicantStageSelect applicantId={1} stage="screening" disabled={false} canEdit={false} />)
    expect(b.container.querySelector("select")).toBeNull()
    expect(b.container.textContent).toContain("Seleksi Berkas")
    act(() => b.root.unmount())

    const c = mount(<HireButton applicantId={1} disabled={false} canEdit={false} />)
    expect(c.container.querySelector("button")).toBeNull()
    act(() => c.root.unmount())
  })

  it("dengan canEdit: ketiga kontrol tampil", () => {
    const a = mount(<VacancyStatusButton vacancyId={1} status="draft" canEdit />)
    expect(a.container.textContent).toContain("Buka Lowongan")
    act(() => a.root.unmount())

    const b = mount(<ApplicantStageSelect applicantId={1} stage="screening" disabled={false} canEdit />)
    expect(b.container.querySelector("select")).not.toBeNull()
    act(() => b.root.unmount())

    const c = mount(<HireButton applicantId={1} disabled={false} canEdit />)
    expect(c.container.textContent).toContain("Terima Jadi Karyawan")
    act(() => c.root.unmount())
  })

  it("halaman meneruskan edit_recruitments sebagai canEdit ke ketiga kontrol", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/sdm/rekrutmen/[slug]/page.tsx"),
      "utf8",
    )
    expect(page).toContain('hasPermission("edit_recruitments")')
    expect(page).toContain("canEdit={canEdit}")
  })
})
