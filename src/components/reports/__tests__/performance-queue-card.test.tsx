// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { PerformanceQueueCard } from "../performance-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import { expectQueueCardTable } from "./queue-card-test-table"
import {
  buildPerformanceQueue,
  PERFORMANCE_QUEUE_NO_GOAL_LABEL,
  type PerformanceQueue,
  type PerformanceQueueInput,
} from "@/lib/reports/performance-review-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { goalPairKey } from "@/lib/reports/performance-review-queue"

const NOW = new Date("2026-10-26T22:00:00.000Z") // 2026-10-27 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<PerformanceQueueInput> = {}): PerformanceQueueInput {
  return {
    cycle: {
      cycleId: 10,
      cycleSlug: "siklus-oktober",
      cycleName: "Siklus Oktober",
      cycleStatus: "active",
      cycleDeletedAt: null,
      periodStart: day(-30),
      periodEnd: day(-10),
    },
    employees: [
      { employeeId: 1, employeeName: "Karyawan Satu", employeeDeletedAt: null, employeeIsActive: true },
      { employeeId: 2, employeeName: "Karyawan Dua", employeeDeletedAt: null, employeeIsActive: true },
      { employeeId: 3, employeeName: "Karyawan Tiga", employeeDeletedAt: null, employeeIsActive: true },
      { employeeId: 4, employeeName: "Karyawan Empat", employeeDeletedAt: null, employeeIsActive: true },
    ],
    reviews: [
      { reviewId: 102, cycleId: 10, employeeId: 2, status: "draft", selfScore: null, managerScore: null, updatedAt: day(-2) },
      { reviewId: 103, cycleId: 10, employeeId: 3, status: "self_submitted", selfScore: "80.00", managerScore: null, updatedAt: day(-5) },
      { reviewId: 104, cycleId: 10, employeeId: 4, status: "manager_reviewed", selfScore: "70.00", managerScore: "75.50", updatedAt: day(-3) },
    ],
    goalPairs: [goalPairKey(10, 2), goalPairKey(10, 3), goalPairKey(10, 4)],
    ...over,
  }
}

describe("PerformanceQueueCard 077-F AC-PFQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("judul/kolom/notice/rekap verbatim server + label ember/tingkat + skor + penanda fakta", () => {
    const queue = buildPerformanceQueue([input()], { now: NOW })
    const rendered = renderCard(<PerformanceQueueCard queue={queue} />)
    root = rendered.root
    const text = expectQueueCardTable(
      rendered.container,
      "Antrean Penilaian Kinerja Belum Selesai",
      "Daftar ini hanya penilaian kinerja yang belum selesai pada siklus aktif. Penilaian dan finalisasi tetap dilakukan dari detail siklus; daftar ini tidak memberi peringkat antar karyawan.",
      [
        "Karyawan",
        "Siklus",
        "Tahap",
        "Skor Diri",
        "Skor Atasan",
        "Periode Berakhir",
        "Menunggu",
      ],
      [
        "2 mengendap · 2 menunggu · 4 belum selesai",
        "Belum Ada Ulasan",
        "Belum Nilai Diri",
        "Menunggu Atasan",
        "Menunggu Finalisasi",
        "80.00",
        "75.50",
        PERFORMANCE_QUEUE_NO_GOAL_LABEL,
      ],
    )
    expect(PERFORMANCE_QUEUE_NO_GOAL_LABEL).toBe("Tanpa Sasaran")
    expect(text).not.toContain("tanpaSasaran")
    // Urutan payload server dipertahankan: mengendap -> menunggu-finalisasi dulu.
    const bodyText = rendered.container.querySelector("tbody")?.textContent ?? ""
    expect(bodyText.indexOf("Karyawan Empat")).toBeLessThan(bodyText.indexOf("Karyawan Tiga"))
  })

  it("passthrough payload buatan: tampil persis, bukan hitung/urut ulang UI", () => {
    const queue: PerformanceQueue = {
      rows: [
        {
          cycleId: 10,
          cycleSlug: null,
          cycleName: "Siklus Uji",
          periodEnd: day(-1),
          employeeId: 9,
          employeeName: "Karyawan Uji",
          stageBucket: "belum-ada-ulasan",
          stageLabel: "Belum Ada Ulasan",
          level: "mengendap",
          levelLabel: "Mengendap",
          umurMenungguHari: 99,
          lewatiAkhirPeriode: true,
          tanpaSasaran: true,
          selfScore: null,
          managerScore: null,
        },
      ],
      cycles: [],
      summary: { mengendap: 42, menunggu: 3, totalBelumSelesai: 45 },
      staleDays: 7,
    }
    const rendered = renderCard(<PerformanceQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).toContain("42 mengendap · 3 menunggu · 45 belum selesai")
    expect(text).toContain("—")
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/sdm/kinerja/10"])
  })

  it("nol kata Peringkat + nol tombol/form aksi tulis; tautan hanya detail siklus", () => {
    const queue = buildPerformanceQueue([input()], { now: NOW })
    const rendered = renderCard(<PerformanceQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).not.toContain("Peringkat")
    expect(rendered.container.querySelector("button")).toBeNull()
    expect(rendered.container.querySelector("form")).toBeNull()
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) => a.getAttribute("href"))
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.every((h) => h === "/sdm/kinerja/siklus-oktober")).toBe(true)
  })

  it("kosong: teks kosong verbatim, tanpa tabel", () => {
    const queue = buildPerformanceQueue([], { now: NOW })
    const rendered = renderCard(<PerformanceQueueCard queue={queue} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain(
      "Tidak ada penilaian kinerja yang belum selesai.",
    )
    expect(rendered.container.querySelector("table")).toBeNull()
  })
})
