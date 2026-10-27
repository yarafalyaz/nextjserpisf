// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

// DataTable memakai useIsMobile (matchMedia tak ada di jsdom).
window.matchMedia =
  window.matchMedia ??
  ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }) as MediaQueryList)

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { permissions: [] } }, status: "authenticated" }),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/crm/tickets",
  useSearchParams: () => new URLSearchParams(),
}))

import type { Root } from "react-dom/client"
import { TicketTable } from "../_components/ticket-table"
import type { CrmTicketSlaPrimaryState } from "@/lib/reports/crm-ticket-sla"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

const DATA = [
  {
    id: 1,
    slug: "tiket-1",
    subject: "Mesin mati total",
    priority: "high",
    status: "open",
    createdAt: "2026-10-19T01:00:00.000Z",
  },
  {
    id: 2,
    slug: "tiket-2",
    subject: "Servis rutin",
    priority: "low",
    status: "in_progress",
    createdAt: "2026-10-26T01:00:00.000Z",
  },
]

describe("TicketTable kolom SLA 001-U", () => {
  it("header SLA sesudah Status; lencana hanya baris lewat/mendekati dari peta server", () => {
    const slaByTicketId = new Map<number, CrmTicketSlaPrimaryState>([
      [1, "LEWAT_RESOLUSI"],
      [2, "DALAM_SLA"],
    ])
    const { container, root } = renderCard(
      <TicketTable
        data={DATA}
        total={2}
        page={1}
        pageSize={20}
        slaByTicketId={slaByTicketId}
      />,
    )
    roots.push(root)

    const headers = [...container.querySelectorAll("th")].map(
      (th) => th.textContent,
    )
    expect(headers.slice(0, 5)).toEqual([
      "Subjek",
      "Prioritas",
      "Status",
      "SLA",
      "Dibuat",
    ])

    const rows = [...container.querySelectorAll("tbody tr")]
    expect(rows).toHaveLength(2)
    // Sel SLA = children[3] sesudah Subjek/Prioritas/Status.
    expect(rows[0].children[3]?.textContent).toContain("Lewat SLA")
    expect(rows[1].children[3]?.textContent ?? "").not.toContain("SLA")
  })

  it("tanpa peta SLA: kolom tampil, nol lencana", () => {
    const { container, root } = renderCard(
      <TicketTable data={DATA} total={2} page={1} pageSize={20} />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("SLA")
    expect(text).not.toContain("Lewat SLA")
    expect(text).not.toContain("Mendekati SLA")
  })
})
