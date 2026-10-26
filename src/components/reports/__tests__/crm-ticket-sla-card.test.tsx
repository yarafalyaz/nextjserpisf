// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { CrmTicketSlaCard } from "../crm-ticket-sla-card"
import { TicketSlaChip } from "../ticket-sla-chip"
import {
  buildCrmTicketSla,
  CRM_TICKET_SLA_EMPTY_TEXT,
  CRM_TICKET_SLA_NOTICE_TEXT,
  type CrmTicketSlaInput,
} from "@/lib/reports/crm-ticket-sla"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

// Senin 2026-10-26 12:00 WIB.
const NOW = new Date("2026-10-26T05:00:00.000Z")

function input(over: Partial<CrmTicketSlaInput>): CrmTicketSlaInput {
  return {
    id: 1,
    slug: "tiket-1",
    ticketNumber: "TK-0001",
    subject: "Mesin mati total",
    priority: "high",
    status: "open",
    customerName: "Bengkel A",
    assignedTo: 7,
    assignedToName: "Sari CS",
    createdAt: new Date("2026-10-19T01:00:00.000Z"),
    firstResponseAt: null,
    resolvedAt: null,
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

describe("TicketSlaChip 001-U", () => {
  it("teks/tone persis per primaryState; dalam SLA tanpa lencana", () => {
    const lewat = renderCard(<TicketSlaChip primaryState="LEWAT_RESOLUSI" />)
    roots.push(lewat.root)
    expect(lewat.container.textContent).toContain("Lewat SLA")
    expect(lewat.container.querySelector(".bg-red-100")).not.toBeNull()

    const dekat = renderCard(<TicketSlaChip primaryState="MENDEKATI_RESPONS" />)
    roots.push(dekat.root)
    expect(dekat.container.textContent).toContain("Mendekati SLA")
    expect(dekat.container.querySelector(".bg-amber-100")).not.toBeNull()

    const dalam = renderCard(<TicketSlaChip primaryState="DALAM_SLA" />)
    roots.push(dalam.root)
    expect(dalam.container.textContent ?? "").not.toContain("SLA")
  })
})

describe("CrmTicketSlaCard 001-U atas F-2026-10-24-135-S", () => {
  it("antrean global verbatim builder: urutan kelebihan, tenggat, penanda prioritas liar; baca-saja", () => {
    const sla = buildCrmTicketSla(
      [
        input({}),
        input({
          id: 2,
          slug: null,
          ticketNumber: null,
          subject: "Prioritas liar tanpa nomor",
          priority: "urgent",
          customerName: null,
          assignedTo: null,
          assignedToName: null,
          createdAt: new Date("2026-10-23T01:00:00.000Z"),
        }),
        input({
          id: 3,
          ticketNumber: "TK-0003",
          subject: "Masih dalam SLA",
          priority: "low",
          status: "in_progress",
          firstResponseAt: new Date("2026-10-26T02:00:00.000Z"),
          createdAt: new Date("2026-10-26T01:00:00.000Z"),
        }),
        input({ id: 4, ticketNumber: "TK-0004", subject: "Sudah Selesai", status: "resolved" }),
        input({
          id: 5,
          ticketNumber: "TK-0005",
          subject: "Sudah Dihapus",
          deletedAt: new Date("2026-10-21T05:00:00.000Z"),
        }),
      ],
      NOW,
      [],
    )
    expect(sla.overdueQueue.map((row) => row.ticketId)).toEqual([1, 2])

    const { container, root } = renderCard(<CrmTicketSlaCard sla={sla} />)
    roots.push(root)
    const text = container.textContent ?? ""

    expect(text).toContain("Tiket Lewat SLA")
    expect(text).toContain(CRM_TICKET_SLA_NOTICE_TEXT)
    for (const header of [
      "No. Tiket",
      "Subjek",
      "SLA",
      "Tenggat",
      "Kelebihan",
      "Pelanggan",
      "Penanggung Jawab",
    ]) {
      expect(text).toContain(header)
    }

    // Ringkasan server verbatim.
    expect(text).toContain("Tiket aktif3")
    expect(text).toContain("Lewat SLA2")
    expect(text).toContain("Prioritas tak dikenal1")

    // Antrean hanya overdueQueue; dalam-SLA/resolved/deleted tak tampil.
    expect(text).toContain("Mesin mati total")
    expect(text).toContain("Prioritas liar tanpa nomor")
    expect(text).not.toContain("Masih dalam SLA")
    expect(text).not.toContain("Sudah Selesai")
    expect(text).not.toContain("Sudah Dihapus")

    // Urutan builder dipertahankan: kelebihan terbesar (id 1) dulu.
    expect(text.indexOf("TK-0001")).toBeLessThan(
      text.indexOf("Prioritas liar tanpa nomor"),
    )

    // Tenggat + kelebihan server apa adanya: assert dari dueAt/
    // overdueMinutes baris builder, bukan hitungan manual di tes.
    const expectedDue = sla.overdueQueue[0].dueAt
    expect(expectedDue).not.toBeNull()
    expect(text).toContain(
      new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(expectedDue as Date),
    )
    expect(text).toContain(`${sla.overdueQueue[0].overdueMinutes} menit`)

    // Penanda prioritas liar + fallback server mentah.
    expect(text).toContain("Prioritas tak dikenal")
    expect(text).toContain("Belum ditugaskan")
    expect(text).toContain("Bengkel A")
    expect(text).toContain("Sari CS")

    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/crm/tickets/tiket-1")
    expect(hrefs).toContain("/crm/tickets/2")

    expect(
      container.querySelectorAll("button, input, select, textarea, form"),
    ).toHaveLength(0)
  })

  it("antrean kosong: emptyText builder + nol tabel", () => {
    const sla = buildCrmTicketSla(
      [
        input({
          subject: "Baru dibuat",
          priority: "low",
          createdAt: new Date("2026-10-26T04:00:00.000Z"),
        }),
      ],
      NOW,
      [],
    )
    const { container, root } = renderCard(<CrmTicketSlaCard sla={sla} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(CRM_TICKET_SLA_EMPTY_TEXT)
    expect(text).toContain(CRM_TICKET_SLA_NOTICE_TEXT)
    expect(container.querySelector("table")).toBeNull()
  })
})
