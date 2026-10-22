// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

import { WorkOrderProgressCard } from "../work-order-progress-card"
import { StatusChip } from "@/components/ui/status-chip"
import {
  buildWorkOrderProgress,
  shouldAutoCompleteWorkOrder,
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
        workCenterId: null,
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

  // F-020 lanjutan (t_96d69b19): verifikasi baca-saja status completed
  // sesudah auto-close tahap terakhir merged di main (PR #493). UI tidak
  // hitung ulang aturan: shouldAutoCompleteWorkOrder = vonis builder server,
  // WorkOrderProgressCard + StatusChip hanya menampilkan apa adanya.
  it("semua tahap tuntas: vonis auto-close cocok + progres 100% + chip WO completed Selesai", () => {
    const ops = [
      { status: "completed" },
      { status: "completed" },
      { status: "skipped", notes: "tidak perlu" },
      { status: "completed" },
    ]
    expect(
      shouldAutoCompleteWorkOrder({
        operations: ops.map((o) => ({ status: o.status })),
      }),
    ).toBe(true)
    const progress = progressOf(ops)
    const { container, root } = renderCard(
      <>
        <StatusChip status="completed" />
        <WorkOrderProgressCard progress={progress} />
      </>,
    )
    const text = container.textContent ?? ""
    expect(text).toContain("Selesai")
    expect(text).toContain("3/3 tahap selesai (100,0%)")
    unmountCard(root)
  })

  it("satu tahap pending: vonis auto-close menolak, chip completed tetap Selesai", () => {
    expect(
      shouldAutoCompleteWorkOrder({
        operations: [{ status: "completed" }, { status: "pending" }],
      }),
    ).toBe(false)
    const { container, root } = renderCard(<StatusChip status="completed" />)
    expect(container.textContent ?? "").toContain("Selesai")
    unmountCard(root)
  })
})
