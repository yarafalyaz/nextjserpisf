// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { CrmTicketWorkloadCard } from "../crm-ticket-workload-card"
import { buildCrmTicketQueue, type CrmTicketQueueInput } from "@/lib/reports/crm-ticket-queue"
import { buildCrmTicketWorkload } from "@/lib/reports/crm-ticket-workload"
import { CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT, CRM_TICKET_WORKLOAD_NOTICE_TEXT } from "@/lib/reports/crm-ticket-workload"
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

function workload(inputs: CrmTicketQueueInput[]) {
  return buildCrmTicketWorkload(buildCrmTicketQueue(inputs, NOW).rows, NOW)
}

function rowsOf(container: HTMLElement) {
  return [...container.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.children].map((td) => td.textContent ?? ""),
  )
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

describe("CrmTicketWorkloadCard F-2026-10-25-033-S", () => {
  it("header/label/hitungan verbatim builder; ember pertama di ringkasan; urutan BR-CTB-05 apa adanya; baca-saja; nol kata kinerja", () => {
    // Fixture disusun tidak terurut (id 9 high 1, id 7 total 2) — urutan
    // tampil wajib hasil builder, UI dilarang mengurutkan ulang.
    const data = workload([
      input({ id: 1, assignedTo: 9, assignedToName: "Bima", priority: "high", createdAt: new Date("2026-10-24T05:00:00.000Z") }),
      input({ id: 2, assignedTo: 7, assignedToName: "Sari CS", priority: "low", firstResponseAt: new Date("2026-10-21T05:00:00.000Z") }),
      input({ id: 3, assignedTo: 7, assignedToName: "Sari CS", priority: "aneh", createdAt: new Date("2026-10-10T05:00:00.000Z") }),
      input({ id: 4, assignedTo: 11, assignedToName: null, priority: "medium", createdAt: new Date("2026-10-15T05:00:00.000Z") }),
      input({ id: 5, assignedTo: null, assignedToName: null, priority: "high", createdAt: new Date("2026-10-01T05:00:00.000Z") }),
      input({ id: 6, assignedTo: null, assignedToName: null, priority: "low", createdAt: new Date("2026-10-05T05:00:00.000Z") }),
      input({ id: 7, assignedTo: 7, assignedToName: "Sari CS", priority: "high", subject: "Sudah Selesai", status: "resolved" }),
    ])
    const { container, root } = renderCard(<CrmTicketWorkloadCard workload={data} />)
    roots.push(root)
    const text = container.textContent ?? ""

    // Judul + notice + label verbatim builder.
    expect(text).toContain("Beban Tiket per Penanggung Jawab")
    expect(text).toContain(CRM_TICKET_WORKLOAD_NOTICE_TEXT)

    // Header lengkap persis urutan kolom (AC-CTB-F1).
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent)
    expect(headers).toEqual([
      "Penanggung Jawab",
      "Tiket Terbuka",
      "Tinggi",
      "Sedang",
      "Rendah",
      "Prioritas tak dikenal",
      "Belum Direspons",
      "Umur sejak dibuat Tertua",
    ])

    // Ringkasan = summary verbatim; ember Belum ditugaskan selalu
    // tampil pertama walau di luar tabel bernama (BR-CTB-05/B2).
    expect(text).toContain("Tiket terbuka6")
    expect(text).toContain("Belum ditugaskan2")
    expect(text).toContain("Belum ditugaskan: 2 tiket terbuka; tertua 1 Oktober 2026")

    // Urutan baris bernama verbatim BR-CTB-05: high desc (Bima 1)
    // mendahului total desc (Sari CS 2); Pengguna #11 terakhir
    // (high 0). Populasi terminal (resolved) keluar dari total.
    const rows = rowsOf(container)
    expect(rows.map((r) => r[0])).toEqual(["Bima", "Sari CS", "Pengguna #11"])
    // Kolom: [nama, total, tinggi, sedang, rendah, takdikenal, belumdirespons, tertua]
    expect(rows[0].slice(1, 7)).toEqual(["1", "1", "0", "0", "0", "1"])
    expect(rows[1].slice(1, 7)).toEqual(["2", "0", "0", "1", "1", "1"])
    expect(rows[2].slice(1, 7)).toEqual(["1", "0", "1", "0", "0", "1"])
    // Tertua dari createdAt tertua kelompok (BR-CTB-05), format existing.
    expect(rows[0][7]).toContain("24 Oktober 2026")
    expect(rows[1][7]).toContain("10 Oktober 2026")
    expect(rows[2][7]).toContain("15 Oktober 2026")

    // BR-CTB-07: dilarang kata penilaian kinerja/peringkat.
    expect(text).not.toMatch(/Kinerja|Peringkat|Terbaik|Terburuk/)

    // Baca-saja total (BR-CTB-06): nol kontrol interaktif/tautan.
    expect(container.querySelectorAll("button, input, select, textarea, form, a")).toHaveLength(0)
  })

  it("semua belum ditugaskan: hanya ember + emptyNamedText builder, nol tabel (EC-CTB-1)", () => {
    const data = workload([
      input({ id: 1, assignedTo: null, assignedToName: null }),
      input({ id: 2, assignedTo: null, assignedToName: null, priority: "low" }),
    ])
    const { container, root } = renderCard(<CrmTicketWorkloadCard workload={data} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain(CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT)
    expect(text).toContain(CRM_TICKET_WORKLOAD_NOTICE_TEXT)
    expect(text).toContain("Belum ditugaskan: 2 tiket terbuka")
    expect(container.querySelector("table")).toBeNull()
  })

  it("kosong total: ember nol tetap tertanda + emptyNamedText, nol tabel", () => {
    const data = workload([])
    const { container, root } = renderCard(<CrmTicketWorkloadCard workload={data} />)
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Tiket terbuka0")
    expect(text).toContain("Belum ditugaskan: 0 tiket terbuka")
    expect(text).toContain(CRM_TICKET_WORKLOAD_EMPTY_NAMED_TEXT)
    expect(container.querySelector("table")).toBeNull()
  })
})
