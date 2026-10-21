// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

import { WorkOrderProgressCard } from "../work-order-progress-card"
import {
  buildWorkOrderProgress,
  type WorkOrderProgressReport,
} from "@/lib/reports/work-order-progress"

function progressOf(
  ops: Array<{ status: string; notes?: string | null }>,
): WorkOrderProgressReport {
  const names = ["Persiapan", "Pengerjaan", "Quality Check", "Selesai"]
  return buildWorkOrderProgress({
    operations: ops.map((op, i) => ({
      id: i + 1,
      name: names[i] ?? `Tahap ${i + 1}`,
      sortOrder: i + 1,
      status: op.status,
      assignedEmployeeId: null,
      estimatedHours: null,
      notes: op.notes ?? null,
    })),
  })
}

afterEach(() => {
  clearRenderedCards()
})

describe("WorkOrderProgressCard F-2026-10-21-020 Tahap B", () => {
  it("progres x/y + persen jujur dari builder tampil apa adanya", () => {
    const progress = progressOf([
      { status: "completed" },
      { status: "in_progress" },
      { status: "pending" },
      { status: "pending" },
    ])
    const { container, root } = renderCard(
      <WorkOrderProgressCard progress={progress} />,
    )
    const text = container.textContent ?? ""
    expect(
      container.querySelector('[aria-label="Progres Tahap Perintah Kerja"]'),
    ).not.toBeNull()
    expect(text).toContain("1/4 tahap selesai (25,0%)")
    expect(text).toContain("1. Persiapan")
    expect(text).toContain(
      "Progres tahap perintah kerja (ringan, tanpa WorkCenter).",
    )
    unmountCard(root)
  })

  it("semua skipped tampil tidak ada tahap aktif, bukan 100%", () => {
    const progress = progressOf([
      { status: "skipped", notes: "tidak perlu" },
      { status: "skipped", notes: "langsung selesai" },
    ])
    const { container, root } = renderCard(
      <WorkOrderProgressCard progress={progress} />,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("tidak ada tahap aktif")
    expect(text).toContain("Alasan dilewati: tidak perlu")
    expect(text).not.toContain("100%")
    unmountCard(root)
  })

  it("tahap terblokir tampil penjelasan penghambat dari builder", () => {
    const progress = progressOf([
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
    ])
    const { container, root } = renderCard(
      <WorkOrderProgressCard progress={progress} />,
    )
    expect(container.textContent ?? "").toContain(
      "Menunggu tahap Persiapan selesai",
    )
    unmountCard(root)
  })

  it("tanpa tahap tampil empty state builder", () => {
    const progress = progressOf([])
    const { container, root } = renderCard(
      <WorkOrderProgressCard progress={progress} />,
    )
    expect(container.textContent ?? "").toContain(
      "Belum ada tahap tercatat untuk perintah kerja ini",
    )
    unmountCard(root)
  })
})
