// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { LeadFollowupsCard } from "../lead-followups-card"
import { buildLeadFollowups, type LeadFollowupInput } from "@/lib/reports/lead-followups"

const NOW = new Date(2026, 9, 21, 10, 0)

function input(over: Partial<LeadFollowupInput>): LeadFollowupInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    status: "contacted",
    activities: [{ scheduledAt: new Date(2026, 9, 18), completedAt: null, createdAt: new Date(2026, 9, 17) }],
    ...over,
  }
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("LeadFollowupsCard F-2026-10-21-037", () => {
  it("tampil baris follow-up lewat + tautan detail; label beda tegas dari Prospek Basi", () => {
    const followups = buildLeadFollowups(
      [
        input({ id: 2, slug: null, leadNumber: null, name: "Andi", activities: [{ scheduledAt: new Date(2026, 9, 21), completedAt: null, createdAt: new Date(2026, 9, 20) }] }),
        input({}),
      ],
      NOW,
    )
    const { container, root } = render(<LeadFollowupsCard followups={followups} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Jadwal follow-up lewat"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Prospek Basi"]')).toBeNull()
    expect(text).toContain("Jadwal follow-up lewat")
    expect(text).toContain("2 prospek dengan jadwal follow-up sudah lewat")
    expect(text).not.toContain("Prospek Basi")
    expect(text).not.toContain("tanpa aktivitas")
    expect(text).toContain("Budi")
    expect(text).toContain("3 hari")
    expect(text).toContain("Hari ini")
    // Urut overdue desc: Budi (3 hari) sebelum Andi (hari ini); slug null -> id.
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/crm/leads/lead-1", "/crm/leads/2"])
    act(() => root.unmount())
  })

  it("Q-LFU-1: lead lost absen dari kartu (builder tak kirim); won + terkonversi-bukan-lost tampil verbatim", () => {
    const followups = buildLeadFollowups(
      [
        input({ id: 3, name: "Lestari", status: "lost" }),
        input({ id: 4, name: "Wawan", status: "won" }),
        input({ id: 5, name: "Tania", status: "qualified", convertedAt: new Date(2026, 9, 19) }),
      ],
      NOW,
    )
    const { container, root } = render(<LeadFollowupsCard followups={followups} />)
    const text = container.textContent ?? ""
    expect(followups.rows.map((r) => r.name)).toEqual(["Wawan", "Tania"])
    expect(text).not.toContain("Lestari")
    expect(text).toContain("Wawan")
    expect(text).toContain("Tania")
    expect(text).toContain("2 prospek dengan jadwal follow-up sudah lewat")
    act(() => root.unmount())
  })

  it("sembunyi total bila 0 baris", () => {
    const { container, root } = render(<LeadFollowupsCard followups={buildLeadFollowups([], NOW)} />)
    expect(container.querySelector('[aria-label="Jadwal follow-up lewat"]')).toBeNull()
    expect(container.textContent ?? "").toBe("")
    act(() => root.unmount())
  })
})
