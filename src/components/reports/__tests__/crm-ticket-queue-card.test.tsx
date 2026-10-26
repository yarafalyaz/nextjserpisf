// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { CrmTicketQueueCard } from "../crm-ticket-queue-card"
import {
  buildCrmTicketQueue,
  CRM_TICKET_PRIORITY_LABELS,
  CRM_TICKET_QUEUE_AGE_LABEL,
  CRM_TICKET_QUEUE_EMPTY_TEXT,
  CRM_TICKET_QUEUE_NOTICE_TEXT,
  type CrmTicketQueueInput,
} from "@/lib/reports/crm-ticket-queue"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

const NOW = new Date("2026-10-26T05:00:00.000Z")

function input(over: Partial<CrmTicketQueueInput>): CrmTicketQueueInput {
  return {
    id: 1,
    slug: "tiket-1",
    ticketNumber: "TK-0001",
    subject: "Mesin mati",
    priority: "medium",
    status: "open",
    customerName: "Bengkel A",
    assignedTo: 7,
    assignedToName: "Sari CS",
    firstResponseAt: null,
    createdAt: new Date("2026-10-20T05:00:00.000Z"),
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

describe("CrmTicketQueueCard F-2026-10-25-032-S", () => {
  it("label/urutan/ringkasan verbatim builder; populasi terminal keluar; baca-saja; nol kata SLA", () => {
    const queue = buildCrmTicketQueue(
      [
        input({}),
        input({
          id: 2,
          slug: null,
          ticketNumber: null,
          subject: "Prioritas liar tanpa nomor",
          priority: "urgent",
          status: "pending",
          customerName: null,
          assignedTo: null,
          assignedToName: null,
          createdAt: new Date("2026-10-26T01:00:00.000Z"),
        }),
        input({
          id: 3,
          ticketNumber: "TK-0003",
          subject: "Tiket tinggi tertua",
          priority: "high",
          status: "in_progress",
          assignedTo: 9,
          assignedToName: null,
          firstResponseAt: new Date("2026-10-15T05:00:00.000Z"),
          createdAt: new Date("2026-10-10T05:00:00.000Z"),
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
    )
    const { container, root } = renderCard(<CrmTicketQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""

    for (const header of [
      "No. Tiket",
      "Subjek",
      "Prioritas",
      "Status",
      "Pelanggan",
      CRM_TICKET_QUEUE_AGE_LABEL,
      "Penanggung Jawab",
    ]) {
      expect(text).toContain(header)
    }

    // Label verbatim builder/konstanta server + notice + ringkasan.
    expect(text).toContain("Antrean Tiket Terbuka")
    expect(text).toContain(CRM_TICKET_QUEUE_NOTICE_TEXT)
    expect(text).toContain(CRM_TICKET_PRIORITY_LABELS.HIGH)
    expect(text).toContain(CRM_TICKET_PRIORITY_LABELS.MEDIUM)
    expect(text).toContain(CRM_TICKET_PRIORITY_LABELS.UNKNOWN)
    expect(text).toContain("Terbuka")
    expect(text).toContain("Dalam Pengerjaan")
    expect(text).toContain("Status tidak dikenal")
    expect(text).toContain("Belum ditugaskan")
    expect(text).toContain("Pengguna #9")
    expect(text).toContain("Bengkel A")
    expect(text).toContain("—")
    // Ringkasan = hitungan baris yang sama (3 tiket: 1 tinggi, 1 sedang,
    // 1 prioritas tak dikenal; 1 belum ditugaskan; 1 belum direspons —
    // tiket liar berstatus pending BUKAN open, di luar BR-CTQ-12).
    expect(text).toContain("Tiket terbuka3")
    expect(text).toContain("Belum direspons1")

    // Urutan BR-CTQ-04 verbatim: tinggi dulu, lalu sedang, prioritas
    // tak dikenal terakhir; UI tidak mengurutkan ulang.
    const i3 = text.indexOf("TK-0003")
    const i1 = text.indexOf("TK-0001")
    const i2 = text.indexOf("Prioritas liar tanpa nomor")
    expect(i3).toBeGreaterThan(-1)
    expect(i3).toBeLessThan(i1)
    expect(i1).toBeLessThan(i2)

    // Penanda belum-direspons hanya dari isUnresponded verbatim
    // (tiket dalam pengerjaan sudah keluar dari open).
    expect(text).not.toContain("Sudah Selesai")
    expect(text).not.toContain("Sudah Dihapus")

    // BR-CTQ-07: dilarang kata terlambat/SLA di permukaan ini.
    expect(text).not.toContain("Terlambat")
    expect(text).not.toContain("Lewat SLA")

    // Tanggal dibuat tampil (format tanggal/format relatif existing),
    // bukan umur hitung ulang di UI.
    expect(text).toContain("10 Oktober 2026")
    expect(text).toContain("yang lalu")

    // Tautan detail tiket existing; slug null jatuh ke id.
    const hrefs = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toContain("/crm/tickets/tiket-1")
    expect(hrefs).toContain("/crm/tickets/2")

    // Baca-saja total (BR-CTQ-06): nol kontrol interaktif selain tautan.
    expect(container.querySelectorAll("button, input, select, textarea, form"))
      .toHaveLength(0)
  })

  it("antrean kosong: emptyText builder + nol tabel", () => {
    const queue = buildCrmTicketQueue([], NOW)
    const { container, root } = renderCard(<CrmTicketQueueCard queue={queue} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(CRM_TICKET_QUEUE_EMPTY_TEXT)
    expect(text).toContain(CRM_TICKET_QUEUE_NOTICE_TEXT)
    expect(container.querySelector("table")).toBeNull()
  })
})
