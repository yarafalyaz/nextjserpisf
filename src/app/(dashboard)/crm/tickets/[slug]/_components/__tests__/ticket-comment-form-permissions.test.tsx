// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/actions/crm.actions", () => ({
  addTicketComment: vi.fn(async () => ({ success: true })),
  deleteTicket: vi.fn(async () => ({ success: true })),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, isDisabled, ...rest }: { children: React.ReactNode; isDisabled?: boolean; [key: string]: unknown }) => (
    <button {...(rest as Record<string, unknown>)} disabled={isDisabled}>{children}</button>
  ),
}))

import { TicketCommentForm } from "../ticket-comment-form"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

afterEach(() => clearRenderedCards())

describe("TicketCommentForm gerbang izin UI (edit_tickets)", () => {
  it("berizin: form tambah komentar tampil", () => {
    const { container, root } = renderCard(<TicketCommentForm ticketId={1} canCreate />)
    expect(container.querySelector('form[aria-label="Tambah komentar"]')).not.toBeNull()
    expect(container.querySelector("#commentBody")).not.toBeNull()
    expect(container.textContent).toContain("Tambah Komentar")
    unmountCard(root)
  })

  it("tanpa izin: form tambah komentar absen", () => {
    const { container, root } = renderCard(<TicketCommentForm ticketId={1} canCreate={false} />)
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("#commentBody")).toBeNull()
    expect(container.textContent ?? "").not.toContain("Tambah Komentar")
    unmountCard(root)
  })

  it("halaman: form dibungkus CanCreate edit_tickets, daftar komentar tetap di luar gerbang", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/crm/tickets/[slug]/page.tsx"), "utf8")
    expect(page).toMatch(/<CanCreate permission="edit_tickets">\s*<TicketCommentForm ticketId=\{ticket\.id\} canCreate \/>/)
    expect(page).toContain("Belum ada komentar")
    expect(page).toContain("ticket.comments.map")
  })
})
