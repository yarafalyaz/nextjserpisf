// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { LeadPriorityQueueCard } from "../lead-priority-queue-card"
import {
  buildLeadPriorityQueue,
  LEAD_PRIORITY_BASIS_LABEL,
  LEAD_PRIORITY_BUCKET_LABELS,
  type LeadPriorityInput,
} from "@/lib/reports/lead-priority"
import {
  LEAD_FUNNEL_NO_VALUE_LABEL,
  LEAD_FUNNEL_VALUE_NOTICE_TEXT,
} from "@/lib/reports/lead-funnel"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

function input(over: Partial<LeadPriorityInput>): LeadPriorityInput {
  return {
    id: 1,
    slug: "prospek-satu",
    leadNumber: "LD-0001",
    name: "Prospek Satu",
    status: "new",
    source: "website",
    expectedCloseDate: new Date(Date.UTC(2026, 9, 30)),
    estimatedValue: 5000000,
    assignedTo: 7,
    assignedToName: "Sari Sales",
    convertedAt: null,
    deletedAt: null,
    ...over,
  }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("LeadPriorityQueueCard F-2026-10-25-031-S", () => {
  it("label/ember/urutan/total verbatim builder; populasi terminal keluar; baca-saja", () => {
    const queue = buildLeadPriorityQueue([
      input({}),
      input({
        id: 2,
        slug: null,
        leadNumber: "LD-0002",
        name: "Prospek Dua",
        status: "aneh",
        source: null,
        expectedCloseDate: null,
        estimatedValue: null,
        assignedTo: null,
        assignedToName: null,
      }),
      input({
        id: 3,
        leadNumber: "LD-0003",
        name: "Prospek Tiga",
        status: "negotiation",
        expectedCloseDate: new Date(Date.UTC(2026, 9, 27)),
        estimatedValue: 2000000,
      }),
      input({ id: 4, leadNumber: "LD-0004", name: "Sudah Menang", status: "won" }),
      input({
        id: 5,
        leadNumber: "LD-0005",
        name: "Sudah Konversi",
        convertedAt: new Date(Date.UTC(2026, 9, 20)),
      }),
      input({
        id: 6,
        leadNumber: "LD-0006",
        name: "Sudah Dihapus",
        deletedAt: new Date(Date.UTC(2026, 9, 20)),
      }),
    ])
    const { container, root } = renderCard(<LeadPriorityQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""

    for (const header of [
      "No. Prospek",
      "Nama",
      "Tahap",
      "Prioritas",
      "Sumber",
      "Target Tutup",
      "Penanggung Jawab",
      "Estimasi Nilai",
    ]) {
      expect(text).toContain(header)
    }

    // Label verbatim builder/konstanta server.
    expect(text).toContain(LEAD_PRIORITY_BUCKET_LABELS.BELUM_DITETAPKAN)
    expect(text).toContain(LEAD_PRIORITY_BASIS_LABEL)
    expect(text).toContain(LEAD_FUNNEL_VALUE_NOTICE_TEXT)
    expect(text).toContain("3 prospek aktif")
    // Σ hanya baris bernilai (5.000.000 + 2.000.000); tanpa nilai tidak Rp0.
    expect(text).toContain("Rp 7.000.000")
    expect(text).toContain("1 prospek tanpa nilai estimasi")
    expect(text).toContain(LEAD_FUNNEL_NO_VALUE_LABEL)
    expect(text).not.toContain("Rp 0")

    // Urutan BR-LSC-08 verbatim: target terdekat dulu, tanpa target terakhir.
    const i3 = text.indexOf("LD-0003")
    const i1 = text.indexOf("LD-0001")
    const i2 = text.indexOf("LD-0002")
    expect(i3).toBeGreaterThan(-1)
    expect(i3).toBeLessThan(i1)
    expect(i1).toBeLessThan(i2)

    // Label per baris verbatim: tahap dikenal, status liar, ember jujur.
    expect(text).toContain("Baru")
    expect(text).toContain("Negosiasi")
    expect(text).toContain("Status tidak dikenal")
    expect(text).toContain("Sumber tidak tercatat")
    expect(text).toContain("Belum ditugaskan")
    expect(text).toContain("Sari Sales")
    expect(text).toContain("30 Oktober 2026")

    // Populasi keluar tidak tampil.
    expect(text).not.toContain("Sudah Menang")
    expect(text).not.toContain("Sudah Konversi")
    expect(text).not.toContain("Sudah Dihapus")

    // Tautan detail prospek existing; slug null jatuh ke id.
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/crm/leads/prospek-satu")
    expect(hrefs).toContain("/crm/leads/2")

    // Baca-saja total: nol kontrol interaktif selain tautan.
    expect(container.querySelectorAll("button, input, select, textarea, form"))
      .toHaveLength(0)
  })

  it("antrean kosong: pesan kosong + nol prospek", () => {
    const queue = buildLeadPriorityQueue([])
    const { container, root } = renderCard(<LeadPriorityQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada prospek aktif")
    expect(text).toContain("0 prospek aktif")
    expect(container.querySelector("table")).toBeNull()
  })
})
