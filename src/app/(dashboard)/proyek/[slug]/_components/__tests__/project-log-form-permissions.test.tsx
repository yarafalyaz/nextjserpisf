// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/actions/project.actions", () => ({
  addProjectLog: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/components/ui/form-select", () => ({
  FormSelect: ({ id }: { id?: string }) => <input id={id} readOnly value="Progres" />,
}))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, isDisabled, ...rest }: { children: React.ReactNode; isDisabled?: boolean; [key: string]: unknown }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>{children}</button>
  ),
}))

import { ProjectLogForm } from "../project-log-form"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"
import { afterEach } from "vitest"

afterEach(() => clearRenderedCards())

describe("ProjectLogForm gerbang izin UI (edit_projects)", () => {
  it("berizin: form tambah log tampil", () => {
    const { container, root } = renderCard(<ProjectLogForm projectId={1} canCreate />)
    expect(container.querySelector('form[aria-label="Tambah log proyek"]')).not.toBeNull()
    expect(container.querySelector("#logNotes")).not.toBeNull()
    expect(container.textContent).toContain("Tambah Log")
    unmountCard(root)
  })

  it("tanpa izin: form tambah log absen", () => {
    const { container, root } = renderCard(<ProjectLogForm projectId={1} canCreate={false} />)
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("#logNotes")).toBeNull()
    expect(container.textContent ?? "").not.toContain("Tambah Log")
    unmountCard(root)
  })

  it("halaman: form dibungkus canEdit (hasPermission edit_projects), tabel log tetap di luar gerbang", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/proyek/[slug]/page.tsx"), "utf8")
    expect(page).toContain('hasPermission("edit_projects")')
    expect(page).toContain("<ProjectLogForm projectId={project.id} canCreate={canEdit} />")
    // Riwayat log (baca) tidak ikut digerbang.
    expect(page).toContain("Belum ada log")
    expect(page).toContain("project.logs.map")
  })
})
