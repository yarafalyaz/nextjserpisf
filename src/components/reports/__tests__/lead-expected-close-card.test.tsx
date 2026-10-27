// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { LeadExpectedCloseCard } from "../lead-expected-close-card"
import {
  buildLeadExpectedCloseQueue,
  LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT,
  type LeadExpectedCloseInput,
} from "@/lib/reports/lead-expected-close"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const NOW = new Date(2026, 9, 26, 10, 0)

function input(over: Partial<LeadExpectedCloseInput>): LeadExpectedCloseInput {
  return {
    id: 1,
    slug: "lead-1",
    leadNumber: "LD-0001",
    name: "Budi",
    status: "contacted",
    expectedCloseDate: new Date(2026, 9, 26),
    estimatedValue: 5000000,
    assignedTo: 7,
    assignedToName: "Sari",
    deletedAt: null,
    ...over,
  }
}

function queueFixture() {
  return buildLeadExpectedCloseQueue(
    [
      // LEWAT_TARGET: kemarin, overdue 1, bernilai.
      input({
        id: 1,
        slug: "lead-lewat",
        leadNumber: "LD-0001",
        name: "Budi Lewat",
        status: "negotiation",
        expectedCloseDate: new Date(2026, 9, 25),
        estimatedValue: 7500000,
      }),
      // MENDEKATI: hari ini, sisa 0, tanpa nilai estimasi (BR-EC-09).
      input({
        id: 2,
        slug: null,
        leadNumber: null,
        name: "Andi Hari Ini",
        status: "new",
        expectedCloseDate: new Date(2026, 9, 26),
        estimatedValue: null,
        assignedTo: null,
        assignedToName: null,
      }),
      // MENDEKATI: 3 hari lagi, status liar tertanda.
      input({
        id: 3,
        slug: "lead-liar",
        leadNumber: "LD-0003",
        name: "Citra Liar",
        status: "aneh",
        expectedCloseDate: new Date(2026, 9, 29),
        estimatedValue: 1000000,
      }),
      // TANPA_TARGET: tanpa tanggal, tampil terpisah tanpa sisa karangan.
      input({
        id: 4,
        slug: "lead-tanpa",
        leadNumber: "LD-0004",
        name: "Dedi Tanpa Target",
        status: "qualified",
        expectedCloseDate: null,
        estimatedValue: 2000000,
      }),
      // Di luar antrean: won + jauh di masa depan tidak boleh bocor.
      input({ id: 5, name: "Eka Menang", status: "won", expectedCloseDate: new Date(2026, 9, 20) }),
      input({
        id: 6,
        name: "Fajar Jauh",
        status: "new",
        expectedCloseDate: new Date(2026, 11, 31),
      }),
    ],
    NOW,
  )
}

describe("LeadExpectedCloseCard F-2026-10-25-027-S", () => {
  it("AC-EC-F1/F3: label ember/tahap/notice verbatim builder + urgensi dari angka builder; nol tombol mutasi", () => {
    const queue = queueFixture()
    const { container, root } = renderCard(
      <LeadExpectedCloseCard queue={queue} canViewLeads />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Antrean target tutup prospek"]')).not.toBeNull()
    expect(text).toContain(LEAD_EXPECTED_CLOSE_VALUE_NOTICE_TEXT)
    expect(text).toContain("Nilai estimasi saat ini, bukan piutang, pendapatan, atau prediksi.")
    expect(text).toContain("Lewat target tutup")
    expect(text).toContain("Mendekati target tutup")
    expect(text).toContain("Tanpa target tutup")
    expect(text).toContain("Negosiasi")
    expect(text).toContain("Baru")
    expect(text).toContain("Terkualifikasi")
    expect(text).toContain("Status tidak dikenal")
    expect(text).toContain("Lewat 1 hari")
    expect(text).toContain("Hari ini")
    expect(text).toContain("3 hari lagi")
    expect(text).toContain("Belum ditugaskan")
    expect(text).toContain("Sari")
    // Di luar antrean tidak bocor ke tampilan.
    expect(text).not.toContain("Eka Menang")
    expect(text).not.toContain("Fajar Jauh")
    expect(text).not.toContain("Menang")
    // AC-EC-F3: baca-saja, nol tombol/form/input.
    expect(container.querySelector("button")).toBeNull()
    expect(container.querySelector("form")).toBeNull()
    expect(container.querySelector("input")).toBeNull()
    expect(container.querySelector("select")).toBeNull()
    unmountCard(root)
  })

  it("BR-EC-09: tanpa nilai tampil label warisan, bukan Rp0; Σ ember dari builder", () => {
    const queue = queueFixture()
    const { container, root } = renderCard(
      <LeadExpectedCloseCard queue={queue} canViewLeads />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Prospek tanpa nilai estimasi")
    expect(text).toContain("1 tanpa nilai estimasi")
    // Σ MENDEKATI hanya baris bernilai (1.000.000), tanpa nilai tidak jadi Rp0.
    expect(text).toContain("Rp 1.000.000,00")
    expect(text).toContain("Rp 7.500.000,00")
    expect(text).not.toContain("Rp 0")
    unmountCard(root)
  })

  it("AC-EC-F2: tanpa view_leads baris tetap tampil, tautan nonaktif tertanda", () => {
    const queue = queueFixture()
    const { container, root } = renderCard(
      <LeadExpectedCloseCard queue={queue} canViewLeads={false} />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector("a")).toBeNull()
    expect(text).toContain("Budi Lewat")
    expect(text).toContain("Andi Hari Ini")
    expect(text).toContain("(detail butuh izin lihat prospek)")
    unmountCard(root)
  })

  it("AC-EC-F2: dengan view_leads tautan detail lead existing per baris", () => {
    const queue = queueFixture()
    const { container, root } = renderCard(
      <LeadExpectedCloseCard queue={queue} canViewLeads />,
    )
    const links = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    )
    expect(links).toEqual([
      "/crm/leads/lead-lewat",
      "/crm/leads/2",
      "/crm/leads/lead-liar",
      "/crm/leads/lead-tanpa",
    ])
    unmountCard(root)
  })

  it("kosong: ketiga ember tampil jujur tanpa baris karangan", () => {
    const queue = buildLeadExpectedCloseQueue([], NOW)
    const { container, root } = renderCard(
      <LeadExpectedCloseCard queue={queue} canViewLeads />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada prospek pada ember ini")
    expect(text).toContain("0 prospek dalam jendela 7 hari")
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
