// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import { CompetencyGapQueueCard } from "../competency-gap-queue-card"
import { renderCard, unmountCard } from "./card-test-utils"
import type {
  CompetencyGapQueue,
  CompetencyGapRow,
} from "@/lib/reports/competency-gap-queue"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => unmountCard(r))
  roots = []
  document.body.replaceChildren()
})

function row(over: Partial<CompetencyGapRow> = {}): CompetencyGapRow {
  return {
    employeeId: 10,
    employeeName: "Budi Santoso",
    positionId: 3,
    positionName: "Teknisi Senior",
    competencyId: 5,
    competencyName: "Kalibrasi Alat",
    requiredLevel: 4,
    currentLevel: 2,
    gap: 2,
    bucket: "di-bawah-syarat",
    bucketLabel: "Di Bawah Syarat",
    isCritical: true,
    criticalLabel: "Kritis",
    assessedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...over,
  }
}

function queue(over: Partial<CompetencyGapQueue> = {}): CompetencyGapQueue {
  return {
    rows: [row()],
    perBucket: {
      "belum-dinilai": { pasangan: 1, karyawanDistinct: 1 },
      "di-bawah-syarat": { pasangan: 1, karyawanDistinct: 1 },
      memenuhi: { pasangan: 2, karyawanDistinct: 2 },
    },
    perCompetency: [],
    perPosition: [],
    summary: {
      totalPasangan: 4,
      totalKaryawan: 3,
      belumDinilai: 1,
      diBawahSyarat: 1,
      memenuhi: 2,
      kritis: 1,
      tanpaSyarat: 0,
      totalKaryawanPopulasi: 3,
    },
    criticalMin: 2,
    ...over,
  }
}

function mount(node: Parameters<typeof renderCard>[0]) {
  const { container, root } = renderCard(node)
  roots.push(root)
  return container
}

describe("CompetencyGapQueueCard — 078-F (AC-CGQ-F1..F3)", () => {
  it("header kolom + notice + label ember verbatim konstanta server", () => {
    const container = mount(<CompetencyGapQueueCard queue={queue()} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Daftar Kesenjangan Kompetensi")
    expect(text).toContain(
      "Daftar ini membandingkan level kompetensi aktual dengan syarat jabatan saat ini. Belum dinilai berbeda dari level rendah; daftar ini tidak memberi peringkat antar karyawan.",
    )
    for (const header of ["Karyawan", "Jabatan", "Kompetensi", "Syarat", "Aktual", "Kesenjangan", "Dinilai"]) {
      expect(container.querySelector("thead")?.textContent).toContain(header)
    }
    expect(text).toContain("Belum Dinilai")
    expect(text).toContain("Di Bawah Syarat")
    expect(text).toContain("Memenuhi Syarat")
  })

  it("baris di-bawah-syarat: level/gap server + penanda Kritis + tanggal dinilai", () => {
    const container = mount(<CompetencyGapQueueCard queue={queue()} />)
    const cells = [...container.querySelectorAll("tbody tr")[0].children]
    expect(cells.map((c) => c.textContent)).toEqual([
      "Budi Santoso",
      "Teknisi Senior",
      "Kalibrasi Alat",
      "4",
      "2",
      "2Kritis",
      expect.stringContaining("2026"),
    ])
    expect(container.textContent).not.toContain("Peringkat")
    // Baca-saja: nol tombol/tautan tulis dari daftar (AC-CGQ-F3).
    expect(container.querySelectorAll("button")).toHaveLength(0)
    expect(container.querySelectorAll("a")).toHaveLength(0)
  })

  it("belum-dinilai: tampil label Belum Dinilai, bukan 0 / Level 0, tanggal —", () => {
    const unassessed = row({
      currentLevel: null,
      gap: null,
      bucket: "belum-dinilai",
      bucketLabel: "Belum Dinilai",
      isCritical: false,
      criticalLabel: null,
      assessedAt: null,
    })
    const container = mount(
      <CompetencyGapQueueCard queue={queue({ rows: [unassessed] })} />,
    )
    const cells = [...container.querySelectorAll("tbody tr")[0].children]
    expect(cells[4].textContent).toBe("Belum Dinilai")
    expect(cells[5].textContent).toBe("Belum Dinilai")
    expect(cells[6].textContent).toBe("—")
    const text = container.textContent ?? ""
    expect(text).not.toContain("Level 0")
  })

  it("kosong: teks kosong server, tanpa tabel", () => {
    const container = mount(
      <CompetencyGapQueueCard queue={queue({ rows: [] })} />,
    )
    expect(container.textContent).toContain("Tidak ada kesenjangan kompetensi.")
    expect(container.querySelector("table")).toBeNull()
  })
})
