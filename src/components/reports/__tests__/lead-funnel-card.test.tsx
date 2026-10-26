// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { LeadFunnelCard } from "../lead-funnel-card"
import {
  buildLeadFunnel,
  type LeadFunnelLeadInput,
} from "@/lib/reports/lead-funnel"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const PERIOD = { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31, 23, 59, 59) }

function lead(over: Partial<LeadFunnelLeadInput>): LeadFunnelLeadInput {
  return {
    id: 1,
    status: "new",
    estimatedValue: 1000000,
    source: "Web",
    assignedTo: 7,
    assignedToName: "Sari",
    customerId: null,
    convertedAt: null,
    deletedAt: null,
    activities: [],
    ...over,
  }
}

describe("LeadFunnelCard F-2026-10-22-092-S", () => {
  it("posisi: label tahap + ember jujur + notice verbatim; tanpa tombol ubah status", () => {
    const funnel = buildLeadFunnel(
      [
        lead({ id: 1, status: "new" }),
        lead({
          id: 2,
          status: "won",
          estimatedValue: null,
          source: null,
          assignedTo: null,
          assignedToName: null,
        }),
        lead({ id: 3, status: "aneh", estimatedValue: 500000 }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    const { container, root } = renderCard(<LeadFunnelCard funnel={funnel} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Corong Prospek"]')).not.toBeNull()
    expect(text).toContain("Corong Prospek — Posisi saat ini")
    expect(text).toContain("Baru")
    expect(text).toContain("Menang")
    expect(text).toContain("Status tidak dikenal")
    expect(text).toContain("Menang belum terkonversi")
    expect(text).toContain("Prospek tanpa nilai estimasi")
    expect(text).toContain("Sumber tidak tercatat")
    expect(text).toContain(
      "Nilai estimasi adalah perkiraan peluang, bukan piutang atau pendapatan.",
    )
    expect(text).toContain("Nilai estimasi saat ini, bukan nilai saat tahap terjadi.")
    expect(container.querySelector("button")).toBeNull()
    // leads_page: tanpa rincian penanggung bernama (Q-LF-1)
    expect(container.querySelector('[aria-label="Per Penanggung"]')).toBeNull()
    unmountCard(root)
  })

  it("gerakan: rasio null tampil 'belum ada data', bukan 0%; penanggung tampil di scope report", () => {
    const funnel = buildLeadFunnel(
      [
        lead({
          id: 1,
          status: "contacted",
          activities: [
            {
              type: "status_change",
              oldStatus: "new",
              newStatus: "contacted",
              createdAt: new Date(2026, 9, 10),
            },
          ],
        }),
      ],
      { includeAssigneeBreakdown: true, period: PERIOD },
    )
    const { container, root } = renderCard(<LeadFunnelCard funnel={funnel} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Corong gerakan periode")
    expect(text).toContain(
      "Corong gerakan membaca histori perubahan status. Prospek lama tanpa histori tampil di posisi saat ini saja.",
    )
    expect(text).toContain("belum ada data")
    // Tahap pertama (Baru) tak punya pendahulu: rasio null dari builder.
    const movementSection = container.querySelector('[aria-label="Corong gerakan periode"]')
    expect(movementSection?.querySelector("tbody tr")?.textContent ?? "").toContain(
      "belum ada data",
    )
    expect(container.querySelector('[aria-label="Per Penanggung"]')).not.toBeNull()
    expect(text).toContain("Sari")
    unmountCard(root)
  })

  it("alasan kalah: 9 baris stabil verbatim builder (8 kategori + tak-tercatat), jumlah cocok ember lost", () => {
    const funnel = buildLeadFunnel(
      [
        lead({
          id: 1,
          status: "lost",
          activities: [
            {
              type: "status_change",
              oldStatus: "qualified",
              newStatus: "lost",
              description: "[kalah:harga] kemahalan",
              createdAt: new Date(2026, 9, 10),
            },
          ],
        }),
        lead({ id: 2, status: "lost" }),
      ],
      { includeAssigneeBreakdown: false, period: null },
    )
    expect(funnel.position.lostByReason).toHaveLength(9)
    const { container, root } = renderCard(<LeadFunnelCard funnel={funnel} />)
    const section = container.querySelector('[aria-label="Alasan Kalah"]')
    expect(section).not.toBeNull()
    const text = section?.textContent ?? ""
    expect(text).toContain("Budget tidak masuk")
    expect(text).toContain("Harga terlalu tinggi")
    expect(text).toContain("Tidak tercatat (lead kalah lama)")
    const rows = Array.from(section?.querySelectorAll("tbody tr") ?? [])
    expect(rows).toHaveLength(9)
    expect(rows.find((r) => r.textContent?.includes("Harga terlalu tinggi"))?.textContent).toContain("1")
    expect(rows.find((r) => r.textContent?.includes("Tidak tercatat"))?.textContent).toContain("1")
    expect(rows.find((r) => r.textContent?.includes("Budget tidak masuk"))?.textContent).toContain("0")
    unmountCard(root)
  })

  it("kosong: pesan bersih, bukan tabel tahap", () => {
    const funnel = buildLeadFunnel([], { includeAssigneeBreakdown: false, period: PERIOD })
    const { container, root } = renderCard(<LeadFunnelCard funnel={funnel} />)
    expect(container.textContent ?? "").toContain("Belum ada prospek")
    expect(container.textContent ?? "").toContain(
      "Belum ada gerakan prospek pada periode ini",
    )
    unmountCard(root)
  })
})
