// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import type { Root } from "react-dom/client"

import type { ProjectTaskQueueInput } from "@/lib/reports/project-task-queue"
import {
  PROJECT_TASK_COLUMN_LABELS_TSQ,
  PROJECT_TASK_MENGENDAP_LABEL,
  PROJECT_TASK_OPEN_QUEUE_TITLE,
  PROJECT_TASK_QUEUE_TITLE,
  PROJECT_TASK_UNASSIGNED_LABEL,
  buildProjectTaskQueue,
} from "@/lib/reports/project-task-queue"
import {
  ProjectTaskMengendapSection,
  ProjectTaskQueueSection,
} from "../project-task-queue"
import { renderCard, unmountCard, clearRenderedCards } from "@/components/reports/__tests__/card-test-utils"

// 2026-10-27 05:00 UTC = 12:00 WIB.
const NOW = new Date("2026-10-27T05:00:00.000Z")
const createdDaysAgo = (days: number) =>
  new Date(Date.UTC(2026, 9, 27 - days))

function input(overrides: Partial<ProjectTaskQueueInput> = {}): ProjectTaskQueueInput {
  return {
    taskId: 1,
    slug: "tugas-1",
    name: "Tugas Satu",
    status: "pending",
    projectId: 10,
    projectName: "Proyek A",
    assignedTo: 5,
    assigneeName: "Budi",
    dueDate: null,
    createdAt: createdDaysAgo(0),
    ...overrides,
  }
}

let roots: Root[] = []
afterEach(() => {
  roots.forEach((root) => unmountCard(root))
  roots = []
  clearRenderedCards()
})

function renderQueue(nodes: Parameters<typeof input>[0][] = [{}]) {
  const queue = buildProjectTaskQueue(nodes.map((n) => input(n)), NOW)
  const { container, root } = renderCard(
    <>
      <section aria-label={PROJECT_TASK_OPEN_QUEUE_TITLE}>
        <ProjectTaskQueueSection queue={queue} />
        <ProjectTaskMengendapSection queue={queue} />
      </section>
    </>,
  )
  roots.push(root)
  return { container, text: container.textContent ?? "" }
}

describe("ProjectTaskQueue 102-S dimensi mengendap (AC-TSQ-F1..F3)", () => {
  it("AC-TSQ-F1: judul gabungan + dua seksi + label dua umur beda kata verbatim; tanpa hitung ulang UI", () => {
    const { container, text } = renderQueue([
      { taskId: 1, name: "LAMA-TANPA-PEMILIK", assignedTo: null, assigneeName: null, createdAt: createdDaysAgo(80) },
      { taskId: 2, name: "BARU-BERTUGAS", createdAt: createdDaysAgo(5) },
    ])
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_OPEN_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_QUEUE_TITLE}"]`)).not.toBeNull()
    expect(container.querySelector(`[aria-label="${PROJECT_TASK_MENGENDAP_LABEL}"]`)).not.toBeNull()
    // Label kolom dua umur wajib beda kata persis (Q-TSQ-2).
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap).toBe("Mengendap")
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.keterlambatan).toBe("Keterlambatan")
    expect(PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap).not.toBe(
      PROJECT_TASK_COLUMN_LABELS_TSQ.keterlambatan,
    )
    expect(text).toContain(PROJECT_TASK_COLUMN_LABELS_TSQ.mengendap)
    // Sel kolom umur pakai label server per baris (paritas layar-vs-builder).
    const queueProbe = buildProjectTaskQueue([input({ taskId: 9, name: 'PROBE', createdAt: createdDaysAgo(80) })], NOW)
    expect(text).toContain(queueProbe.rows[0].mengendapLabel)
    // Rekap irisan verbatim server.
    expect(text).toContain(`${PROJECT_TASK_MENGENDAP_LABEL} 1`)
    expect(text).toContain(`${PROJECT_TASK_UNASSIGNED_LABEL} 1`)
    expect(text).toContain("LAMA-TANPA-PEMILIK")
    expect(text).toContain("BARU-BERTUGAS")
  })

  it("AC-TSQ-F2: tanpa tombol tulis dari antrean; tautan baris hanya ke detail tugas existing", () => {
    const { container } = renderQueue()
    expect(container.querySelector("button")).toBeNull()
    const links = [...container.querySelectorAll("a")].map((a) =>
      a.getAttribute("href"),
    )
    expect(links.length).toBeGreaterThan(0)
    links.forEach((href) => expect(href).toMatch(/^\/proyek\/tugas/))
  })

  it("AC-TSQ-F3: baris tertanda MENGENDAP + BELUM_DITUGASKAN tampil dengan tandanya", () => {
    const { text } = renderQueue([
      { taskId: 1, name: "LEWAT-TANPA-PEMILIK", assignedTo: null, assigneeName: null, dueDate: new Date(Date.UTC(2026, 9, 17)), createdAt: createdDaysAgo(30) },
    ])
    expect(text).toContain(PROJECT_TASK_MENGENDAP_LABEL)
    expect(text).toContain(PROJECT_TASK_UNASSIGNED_LABEL)
  })
})
