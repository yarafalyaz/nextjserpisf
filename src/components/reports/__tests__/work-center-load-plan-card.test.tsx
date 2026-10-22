// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { WorkCenterLoadPlanCard } from "../work-center-load-plan-card"
import {
  buildWorkCenterLoadPlan,
  type WorkCenterLoadPlanCenterInput,
  type WorkCenterLoadPlanOperationInput,
} from "@/lib/reports/work-center-load-plan"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

// Senin 2026-10-19 .. Minggu 2026-10-25 (WIB lokal).
const NOW = new Date(2026, 9, 21, 10, 0, 0)

function center(over: Partial<WorkCenterLoadPlanCenterInput>): WorkCenterLoadPlanCenterInput {
  return {
    id: 1,
    name: "Las",
    capacityHoursPerDay: 8,
    parallelStations: 1,
    isActive: true,
    sortOrder: 0,
    ...over,
  }
}

function op(over: Partial<WorkCenterLoadPlanOperationInput>): WorkCenterLoadPlanOperationInput {
  return {
    id: 1,
    workOrderId: 10,
    workOrderDocumentNo: "WO-10",
    workOrderSlug: "wo-10",
    workOrderStatus: "in_progress",
    workOrderEndDate: null,
    customerName: "Budi",
    vehicleLabel: "B 1234 CD",
    name: "Las rangka",
    status: "pending",
    estimatedHours: 10,
    workCenterId: 1,
    assignedEmployeeId: 5,
    assignedEmployeeName: "Andi",
    effectiveSchedule: { workDays: "1,2,3,4,5", departmentId: 3 },
    ...over,
  }
}

describe("WorkCenterLoadPlanCard F-2026-10-22-090-S", () => {
  it("render judul, notice verbatim, ember, dan drill dari loader apa adanya", () => {
    const plan = buildWorkCenterLoadPlan({
      centers: [center({})],
      operations: [
        op({}),
        op({
          id: 2,
          name: "Tahap tanpa stasiun",
          estimatedHours: 4,
          workCenterId: null,
        }),
      ],
      holidays: [],
      departmentHolidays: [],
      now: NOW,
    })
    const { container, root } = renderCard(<WorkCenterLoadPlanCard plan={plan} />)
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Beban Rencana Stasiun Kerja"]')).not.toBeNull()
    expect(text).toContain("Beban rencana dihitung dari estimasi jam tahap yang belum selesai. Ini rencana kasar untuk melihat kepadatan stasiun, bukan jadwal pasti dan tidak mengunci tanggal selesai.")
    expect(text).toContain("Stasiun")
    expect(text).toContain("Beban Rencana (jam)")
    expect(text).toContain("Tahap Belum Ada Estimasi")
    expect(text).toContain("Kapasitas Tersedia (jam)")
    expect(text).toContain("Beban (%)")
    expect(text).toContain("Belum ada stasiun")
    expect(text).toContain("Rincian Tahap Penyusun Beban")
    expect(text).toContain("WO-10")
    expect(text).toContain("Las rangka")
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    expect(links).toContain("/produksi/perintah-kerja/wo-10")
    unmountCard(root)
  })

  it("kapasitas/persen null tampil —, bukan persen karangan (AC-LP-5)", () => {
    const plan = buildWorkCenterLoadPlan({
      centers: [center({})],
      operations: [op({ effectiveSchedule: null })],
      holidays: [],
      departmentHolidays: [],
      now: NOW,
    })
    const { container, root } = renderCard(<WorkCenterLoadPlanCard plan={plan} />)
    const text = container.textContent ?? ""
    // Sel kapasitas/persen baris stasiun Las minggu berjalan persis "—":
    // dosis mutasi persen null -> "0%" wajib memerahkan tes ini.
    const rows = Array.from(container.querySelectorAll("tbody tr")).map(
      (tr) => tr.textContent ?? "",
    )
    const lasCurrent = rows.find((t) => t.includes("Las") && t.includes("50")) ??
      rows.find((t) => t.includes("Las"))
    expect(lasCurrent).toBeDefined()
    expect(lasCurrent!.endsWith("——") || lasCurrent!.includes("——")).toBe(true)
    expect(text).not.toContain("0%")
    expect(text).not.toContain("Melebihi kapasitas")
    // Beban jam tetap tampil walau tanpa dasar kapasitas.
    expect(text).toContain("10")
    unmountCard(root)
  })

  it("persen > 100 dari loader tampil penanda Melebihi kapasitas (AC-LP-6)", () => {
    const plan = buildWorkCenterLoadPlan({
      centers: [center({ capacityHoursPerDay: 1, parallelStations: 1 })],
      operations: [op({ estimatedHours: 50 })],
      holidays: [],
      departmentHolidays: [],
      now: NOW,
    })
    const { container, root } = renderCard(<WorkCenterLoadPlanCard plan={plan} />)
    expect(container.textContent ?? "").toContain("Melebihi kapasitas")
    unmountCard(root)
  })

  it("tanpa tahap penyusun tampil teks kosong drill, bukan tabel drill", () => {
    const plan = buildWorkCenterLoadPlan({
      centers: [center({})],
      operations: [],
      holidays: [],
      departmentHolidays: [],
      now: NOW,
    })
    const { container, root } = renderCard(<WorkCenterLoadPlanCard plan={plan} />)
    const text = container.textContent ?? ""
    expect(text).toContain("Belum ada tahap penyusun beban minggu ini")
    expect(text).toContain("Belum ada stasiun")
    unmountCard(root)
  })
})
