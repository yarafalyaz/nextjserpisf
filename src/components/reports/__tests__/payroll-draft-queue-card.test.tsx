// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { PayrollDraftQueueCard } from "../payroll-draft-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectNoQueueButtons } from "./draft-queue-card-test-fixtures"
import {
  buildPayrollDraftQueue,
  type PayrollDraftInput,
  type PayrollDraftQueue,
} from "@/lib/reports/payroll-draft-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-26T05:00:00.000Z") // 12:00 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<PayrollDraftInput> = {}): PayrollDraftInput {
  return {
    payrollId: 1,
    slug: "slip-1",
    documentNo: "PAY/2026/001",
    status: "draft",
    employeeId: 10,
    employeeName: "Karyawan Uji",
    period: "2026-10",
    type: "REGULAR",
    startDate: day(-14),
    endDate: day(-7),
    createdByName: "Pemroses Uji",
    createdAt: day(-5),
    ...over,
  }
}

describe("PayrollDraftQueueCard 070-F AC-PDQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-PDQ-F1: judul/kolom/notice verbatim server + rekap dari payload", () => {
    const queue = buildPayrollDraftQueue(
      [input({}), input({ payrollId: 2, slug: "slip-2", documentNo: "PAY/2026/002", createdAt: day(-1) })],
      NOW,
    )
    const rendered = renderCard(<PayrollDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(rendered.container.querySelector('[aria-label="Antrean Slip Gaji Draft"]')).not.toBeNull()
    const headers = [...rendered.container.querySelectorAll("th")].map((el) => el.textContent)
    expect(headers).toEqual([
      "Menunggu",
      "No. Slip",
      "Karyawan",
      "Periode",
      "Rentang",
      "Tipe",
      "Dibuat Oleh",
    ])
    // Notice verbatim server + rekap payload + label tingkat + umur tempel.
    for (const expected of [
      "Daftar ini hanya slip gaji yang masih draft. Slip draft belum disetujui dan belum dibayar; proses lewat detail slip. Nominal gaji tidak ditampilkan di daftar ini.",
      "1 mengendap · 1 menunggu proses · 2 slip draft",
      "2026-10: 2 slip (1 mengendap, 1 menunggu proses)",
      "Mengendap",
      "5 hari",
      "Menunggu Proses",
      "1 hari",
      "Karyawan Uji",
      "Pemroses Uji",
      "REGULAR",
    ]) {
      expect(text).toContain(expected)
    }
  })

  it("AC-PDQ-F1: passthrough umur/tingkat/count buatan — tampil payload, bukan hitung-ulang", () => {
    // Fixture tak konsisten: createdAt kemarin (hitung-ulang = 1 hari /
    // menunggu), payload menyatakan umur 99 + Mengendap + count 42/3/45.
    // UI wajib menempel payload; hitung-ulang apa pun -> MERAH.
    const queue: PayrollDraftQueue = {
      rows: [
        {
          ...input({ createdAt: day(-1) }),
          tingkat: "mengendap",
          tingkatLabel: "Mengendap",
          umurDraftHari: 99,
          umurDariMasaDepan: false,
        },
      ],
      levelCounts: { mengendap: 42, menunggu: 3 },
      periodCounts: [
        { period: "2026-09", levelCounts: { mengendap: 40, menunggu: 2 }, total: 42 },
      ],
      totalDocuments: 45,
    }
    const rendered = renderCard(<PayrollDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).not.toContain("1 hari")
    expect(text).toContain("42 mengendap · 3 menunggu proses · 45 slip draft")
    expect(text).toContain("2026-09: 42 slip (40 mengendap, 2 menunggu proses)")
  })

  it("AC-PDQ-F2: urutan payload dipertahankan; karyawan/pembuat kosong tampil —", () => {
    const queue = buildPayrollDraftQueue(
      [
        input({ payrollId: 2, slug: "slip-2", documentNo: "PAY/2026/002", createdAt: day(-1), employeeName: null, createdByName: null }),
        input({}),
      ],
      NOW,
    )
    const rendered = renderCard(<PayrollDraftQueueCard queue={queue} />)
    root = rendered.root
    const rowsDom = [...rendered.container.querySelectorAll("tbody tr")]
    expect(rowsDom).toHaveLength(2)
    // Builder mengurut mengendap dulu: PAY/2026/001 (5 hari) sebelum 002.
    expect(rowsDom[0]?.textContent).toContain("PAY/2026/001")
    expect(rowsDom[1]?.textContent).toContain("PAY/2026/002")
    expect(rowsDom[1]?.children[2]?.textContent).toBe("—")
    expect(rowsDom[1]?.children[6]?.textContent).toBe("—")
  })

  it("AC-PDQ-F3: tanpa nominal apa pun + nol tombol aksi; tautan hanya detail slip", () => {
    const queue = buildPayrollDraftQueue([input({})], NOW)
    const rendered = renderCard(<PayrollDraftQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    for (const banned of ["Rp", "Proses Slip", "Setujui", "Bayar", "Hapus", "Gaji Pokok", "Tunjangan", "Potongan"]) {
      expect(text).not.toContain(banned)
    }
    expect(rendered.container.innerHTML).not.toContain("title=")
    expectNoQueueButtons(rendered.container)
    expect(rendered.container.querySelector("form")).toBeNull()
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/sdm/penggajian/slip-1"])
  })

  it("kosong: teks kosong tampil, tanpa tabel", () => {
    const queue = buildPayrollDraftQueue([], NOW)
    const rendered = renderCard(<PayrollDraftQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain("Tidak ada slip gaji draft.")
    expect(rendered.container.querySelector("table")).toBeNull()
  })
})
