// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot, type Root } from "react-dom/client"
import { act } from "react"

import { StaleLeadsCard } from "../stale-leads-card"
import { buildStaleLeads, type StaleLeadInput } from "@/lib/reports/stale-leads"

const NOW = new Date(2026, 9, 20, 10, 0)

function input(over: Partial<StaleLeadInput>): StaleLeadInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    company: "PT Budi",
    status: "new",
    createdAt: new Date(2026, 9, 1),
    activities: [],
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

describe("StaleLeadsCard F-2026-10-20-29(a)", () => {
  it("render hitungan + baris basi + tautan detail; kosong tampil pesan bersih", () => {
    const stale = buildStaleLeads(
      [
        input({ id: 2, slug: null, leadNumber: null, name: "Andi", company: null, createdAt: new Date(2026, 9, 5) }),
        input({ id: 1, createdAt: new Date(2026, 9, 19) }),
      ],
      NOW,
    )
    const { container, root } = render(<StaleLeadsCard stale={stale} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Prospek Basi"]')).not.toBeNull()
    expect(text).toContain("1 prospek tanpa aktivitas > 7 hari")
    expect(text).toContain("Andi")
    expect(text).toContain("15 hari")
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/crm/leads/2"])
    act(() => root.unmount())

    const empty = render(<StaleLeadsCard stale={buildStaleLeads([], NOW)} />)
    expect(empty.container.textContent ?? "").toContain("Tidak ada prospek basi")
    expect(empty.container.textContent ?? "").toContain("0 prospek tanpa aktivitas > 7 hari")
    act(() => empty.root.unmount())
  })
})
