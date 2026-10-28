// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { createRoot } from "react-dom/client"
import { act } from "react"

import { ProjectTaskQueueSection } from "../project-task-queue"
import {
  PROJECT_TASK_BUCKET_LABELS,
  PROJECT_TASK_COLUMN_LABELS_TSQ,
  PROJECT_TASK_MENGENDAP_LABEL,
  PROJECT_TASK_OPEN_QUEUE_TITLE,
  PROJECT_TASK_QUEUE_TITLE,
  buildProjectTaskQueue,
  type ProjectTaskQueueInput,
} from "@/lib/reports/project-task-queue"

// Hari kalender WIB 27 Okt 2026; due tersimpan tengah malam UTC hari WIB.
const NOW = new Date(Date.UTC(2026, 9, 27, 5)) // 12:00 WIB
const due = (offset: number) => new Date(Date.UTC(2026, 9, 27 + offset))
const createdDaysAgo = (days: number) => new Date(Date.UTC(2026, 9, 27 - days))

function input(overrides: Partial<ProjectTaskQueueInput> = {}): ProjectTaskQueueInput {
  return {
    taskId: 1,
    slug: "tugas-uji",
    name: "Tugas Uji",
    status: "pending",
    projectId: 10,
    projectName: "Proyek Uji",
    assignedTo: 5,
    assigneeName: "Budi",
    dueDate: due(-10),
    createdAt: createdDaysAgo(0),
    ...overrides,
  }
}

function queueFixture() {
  return buildProjectTaskQueue(
    [
      // Belum-ditugaskan + mengendap (kepala urutan BR-TSQ-10).
      input({ taskId: 1, name: "MENGENDAP-TANPA-PEMILIK", assignedTo: null, assigneeName: null, dueDate: null, createdAt: createdDaysAgo(90) }),
      // Mengendap bertenggat jauh (EC-TSQ-2): mengendap (created 80 hari) walau
      // belum lewat tenggat — kedua fakta tampil terpisah, tidak digabung.
      input({ taskId: 2, name: "MENGENDAP-BERTENGGAT", dueDate: due(60), createdAt: createdDaysAgo(80) }),
      // Lewat tenggat muda bertugas: ember 091 utuh (Terlambat N hari).
      input({ taskId: 4, name: "LEWAT-MUDA", dueDate: due(-10), createdAt: createdDaysAgo(1) }),
      // Muda, bertugas, mendekati: bukan mengendap.
      input({ taskId: 3, name: "MUDA-MENDEKATI", dueDate: due(2), createdAt: createdDaysAgo(1) }),
    ],
    NOW,
  )
}

function render(node: React.ReactNode) {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
  })
  return { container, root }
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8")
}

describe("ProjectTaskQueueSection — permukaan gabungan 102-F (F-2026-10-27-102-S)", () => {
  it("AC-TSQ-F1: judul gabungan outer + judul 091 TETAP seksi tenggat; rekap mengendap verbatim server", () => {
    const queue = queueFixture()
    expect(queue.mengendapCount).toBe(2)
    expect(queue.belumDitugaskanCount).toBe(1)
    expect(queue.mengendapBelumDitugaskanCount).toBe(1)
    const { container, root } = render(<ProjectTaskQueueSection queue={queue} />)
    const text = container.textContent ?? ""
    // Outer gabungan + seksi tenggat TETAP + seksi mengendap.
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_OPEN_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_MENGENDAP_LABEL}"]`)).not.toBeNull()
    // Rekap verbatim angka server (2/1/1) — bukan hitungan UI.
    expect(text).toContain(`${PROJECT_TASK_MENGENDAP_LABEL} 2`)
    expect(text).toContain(`Belum ditugaskan 1`)
    expect(text).toContain(`${PROJECT_TASK_MENGENDAP_LABEL} + Belum ditugaskan 1`)
    act(() => root.unmount())
    container.remove()
  })

  it("AC-TSQ-F1: dua umur beda kata persis — Keterlambatan (dueDate) vs Mengendap (createdAt), tidak tertukar", () => {
    const queue = queueFixture()
    const { container, root } = render(<ProjectTaskQueueSection queue={queue} />)
    const text = container.textContent ?? ""
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.keterlambatan).toBe("Keterlambatan")
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap).toBe("Mengendap")
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.keterlambatan).not.toBe(PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap)
    // Label keterlambatan 091 (Terlambat N hari) tetap tampil di seksi tenggat.
    expect(text).toContain("Terlambat")
    // Label mengendap 102 verbatim server tampil di kedua seksi.
    const expected = queue.rows[0].mengendapLabel
    expect(expected).toBe(`Mengendap ${queue.rows[0].umurMengendapHari} hari`)
    expect(text).toContain(expected)
    // Ember penugasan tampil sebagai label warisan, bukan kode mentah.
    expect(text).not.toContain("BELUM_DITUGASKAN")
    act(() => root.unmount())
    container.remove()
  })

  it("AC-TSQ-F2: tanpa kontrol tulis; tautan baris hanya ke detail tugas existing", () => {
    const uiSource = source("src/app/(dashboard)/proyek/tugas/_components/project-task-queue.tsx")
    expect(uiSource).not.toMatch(/<button|onClick=|onPress=|createTask|updateTask|deleteTask/)
    expect(uiSource).not.toMatch(/>\s*(Selesai|Ubah|Tugaskan|Hapus)\s*</)
    expect(uiSource).toContain('entityHref("/proyek/tugas"')
    expect(uiSource).not.toMatch(/href="\/proyek\/(?!tugas)/)
    const { container, root } = render(<ProjectTaskQueueSection queue={queueFixture()} />)
    expect(container.querySelector("button")).toBeNull()
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "")
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) expect(href.startsWith("/proyek/tugas")).toBe(true)
    act(() => root.unmount())
    container.remove()
  })

  it("AC-TSQ-F3: baris tertanda tampil dengan tandanya; ember tenggat 091 utuh", () => {
    const queue = queueFixture()
    const { container, root } = render(<ProjectTaskQueueSection queue={queue} />)
    const text = container.textContent ?? ""
    // Tanda MENGENDAP + Belum ditugaskan tampil (flags server).
    expect(text).toContain("Mengendap")
    expect(text).toContain("Belum ditugaskan")
    // Ember tenggat 091 utuh: label ember dikenal + keterlambatan tampil.
    expect(text).toContain(PROJECT_TASK_BUCKET_LABELS.LEWAT_TENGGAT)
    expect(text).toContain("Terlambat 10 hari")
    // Seksi mengendap hanya memuat baris mengendap (2 dari 4).
    const mengendapSection = container.querySelector(
      `section[aria-label="${PROJECT_TASK_MENGENDAP_LABEL}"]`,
    )!
    expect(mengendapSection.textContent).toContain("MENGENDAP-TANPA-PEMILIK")
    expect(mengendapSection.textContent).toContain("MENGENDAP-BERTENGGAT")
    expect(mengendapSection.textContent).not.toContain("MUDA-MENDEKATI")
    act(() => root.unmount())
    container.remove()
  })
})
