// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/actions/crm.actions", () => ({
  convertLead: vi.fn(async () => ({ success: true })),
  addLeadActivity: vi.fn(async () => ({ success: true })),
  completeLeadActivity: vi.fn(async () => ({ success: true })),
  reopenLeadActivity: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/components/ui/form-select", () => ({
  FormSelect: ({ id }: { id?: string }) => <input id={id} readOnly value="note" />,
}))
vi.mock("@/components/ui/shadcn/button", () => ({
  Button: ({ children, disabled, ...rest }: { children: React.ReactNode; disabled?: boolean; [key: string]: unknown }) => (
    <button {...(rest as Record<string, unknown>)} disabled={disabled}>{children}</button>
  ),
}))

import { AddLeadActivityForm } from "../lead-actions"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => clearRenderedCards())

describe("AddLeadActivityForm gerbang izin UI (edit_leads + pemilik/manage)", () => {
  it("berizin: form tambah aktivitas tampil", () => {
    const { container, root } = renderCard(<AddLeadActivityForm leadId={1} canCreate />)
    expect(container.querySelector("#activitySubject")).not.toBeNull()
    expect(container.querySelector("#activityDesc")).not.toBeNull()
    expect(container.textContent).toContain("Tambah")
    unmountCard(root)
  })

  it("tanpa izin: form tambah aktivitas absen", () => {
    const { container, root } = renderCard(<AddLeadActivityForm leadId={1} canCreate={false} />)
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("#activitySubject")).toBeNull()
    expect(container.textContent ?? "").not.toContain("Tambah")
    unmountCard(root)
  })

  it("halaman: form menerima canActOnLeadActivities (gerbang server sama dengan addLeadActivity), riwayat tetap tampil", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/crm/leads/[slug]/page.tsx"), "utf8")
    expect(page).toContain('viewerPermissions.includes("edit_leads")')
    expect(page).toContain('<AddLeadActivityForm leadId={lead.id} canCreate={canActOnLeadActivities} />')
    expect(page).toContain("Belum ada aktivitas")
    expect(page).toContain("lead.activities.map")
  })
})
