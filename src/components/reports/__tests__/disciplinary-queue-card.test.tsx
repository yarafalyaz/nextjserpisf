// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { DisciplinaryQueueCard } from "../disciplinary-queue-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  buildDisciplinaryQueue,
  type DisciplinaryQueue,
  type DisciplinaryQueueRecordInput,
} from "@/lib/reports/disciplinary-queue"

const NOW = new Date("2026-10-27T03:00:00.000Z")
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function rec(
  over: Partial<DisciplinaryQueueRecordInput> = {},
): DisciplinaryQueueRecordInput {
  return {
    id: 1,
    employeeId: 10,
    employeeName: "Budi",
    departmentName: "Bengkel",
    level: "sp1",
    violationCategory: "mangkir tanpa keterangan berulang",
    violationDate: d("2026-10-20"),
    workflowStatus: "draft",
    requestedBy: 7,
    requesterName: "Atasan",
    approvedBy: null,
    secondApprovedBy: null,
    documentNo: null,
    voidOfId: null,
    voidedAt: null,
    deletedAt: null,
    createdAt: d("2026-10-24"),
    ...over,
  }
}

describe("DisciplinaryQueueCard 095-F AC-DQ-F1..F3", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("AC-DQ-F1: judul + dua ember terpisah berlabel verbatim + label level/tingkat/umur verbatim server", () => {
    const queue = buildDisciplinaryQueue(
      [
        rec({ id: 1, workflowStatus: "draft" }),
        rec({
          id: 2,
          employeeName: "Sari",
          level: "sp3",
          workflowStatus: "pending_approval",
          approvedBy: 8,
          createdAt: d("2026-10-26"),
        }),
      ],
      { now: NOW },
    )
    const rendered = renderCard(<DisciplinaryQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("Rekod Disiplin Belum Terbit")
    expect(text).toContain("Belum Diajukan")
    expect(text).toContain("Menunggu Persetujuan")
    expect(text).toContain("Surat Peringatan 1 (SP1)")
    expect(text).toContain("Surat Peringatan 3 (SP3)")
    expect(text).toContain("Mengendap")
    expect(text).toContain("3 hari")
    expect(text).toContain("mangkir tanpa keterangan berulang")
    // Fakta persetujuan verbatim, tanpa simpulan langkah.
    expect(text).toContain("Pertama: 8")
    expect(text).not.toMatch(/menunggu penyetuju|kurang persetujuan/i)
    // Dua seksi ember terpisah.
    expect(
      rendered.container.querySelectorAll(
        'section[aria-label="Belum Diajukan"], section[aria-label="Menunggu Persetujuan"]',
      ).length,
    ).toBe(2)
  })

  it("AC-DQ-F1: passthrough payload buatan tampil persis (UI tidak hitung ulang)", () => {
    const queue: DisciplinaryQueue = {
      rows: [
        {
          id: 9,
          employeeId: 3,
          employeeName: "Karyawan Uji",
          departmentName: null,
          level: "sp2",
          levelLabel: "Label Server Uji",
          violationCategory: "kategori-uji",
          violationDate: d("2026-01-01"),
          workflowStatus: "draft",
          stageBucket: "draft",
          stageLabel: "Belum Diajukan",
          tier: "mengendap",
          tierLabel: "Mengendap",
          umurMenungguHari: 99,
          requestedBy: 4,
          requesterName: "Pengaju Uji",
          approvedBy: null,
          secondApprovedBy: null,
          documentNo: null,
          createdAt: d("2026-01-01"),
        },
      ],
      draft: [],
      pendingApproval: [],
      summary: { draft: 42, pending_approval: 3, mengendap: 42, menunggu: 3, total: 45 },
      staleDays: 3,
    }
    // draft ember sengaja kosong di payload buatan; baris tetap dari rows? Card membaca draft/pendingApproval.
    queue.draft = queue.rows
    const rendered = renderCard(<DisciplinaryQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("99 hari")
    expect(text).toContain("Label Server Uji")
    expect(text).toContain("42")
  })

  it("AC-DQ-F2/F3: tanpa isi kasus, tautan hanya ke detail, nol tombol/form aksi", () => {
    const queue = buildDisciplinaryQueue(
      [rec({ id: 5 }), rec({ id: 6, workflowStatus: "pending_approval" })],
      { now: NOW },
    )
    const rendered = renderCard(<DisciplinaryQueueCard queue={queue} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    for (const banned of [
      "description",
      "regulationReference",
      "employeeResponse",
      "rejectionReason",
      "voidReason",
    ]) {
      expect(text).not.toContain(banned)
    }
    expect(rendered.container.querySelector("button")).toBeNull()
    expect(rendered.container.querySelector("form")).toBeNull()
    for (const action of ["Ajukan", "Setujui", "Tolak", "Terbitkan", "Batal"]) {
      // "Menunggu Persetujuan"/judul mengandung kata terkait; cek sebagai tombol/tautan aksi.
      expect(
        [...rendered.container.querySelectorAll("a,button")].some(
          (el) => el.textContent?.trim() === action,
        ),
      ).toBe(false)
    }
    const hrefs = [...rendered.container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(hrefs).toEqual(["/sdm/disiplin/5", "/sdm/disiplin/6"])
  })

  it("kosong: teks kosong verbatim tanpa tabel; satu ember kosong tetap berlabel", () => {
    const empty = buildDisciplinaryQueue([], { now: NOW })
    const rendered = renderCard(<DisciplinaryQueueCard queue={empty} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain(
      "Tidak ada rekod disiplin yang belum terbit.",
    )

    const onlyDraft = buildDisciplinaryQueue([rec({ id: 1 })], { now: NOW })
    const second = renderCard(<DisciplinaryQueueCard queue={onlyDraft} />)
    const text2 = second.container.textContent ?? ""
    expect(text2).toContain("Menunggu Persetujuan")
    expect(text2).toContain("Tidak ada rekod pada tahap ini.")
    unmountCard(second.root)
  })
})
