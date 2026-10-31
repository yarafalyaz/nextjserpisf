import { describe, expect, it } from "vitest"
import { planDueDateBackfill } from "@/lib/finance/due-date-backfill"

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe("planDueDateBackfill (R8-JB-09 lanjutan)", () => {
  it("date + termDays; termin 0 hari = tanggal dokumen", () => {
    const plans = planDueDateBackfill([
      { id: 2, date: d("2026-10-01"), termDays: 30 },
      { id: 1, date: d("2026-10-05"), termDays: 0 },
    ])
    expect(plans).toEqual([
      { id: 1, dueDate: d("2026-10-05") },
      { id: 2, dueDate: d("2026-10-31") },
    ])
  })

  it("lawan tanpa termin aktif (termDays null) dilewati — dueDate tetap null", () => {
    expect(planDueDateBackfill([{ id: 1, date: d("2026-10-01"), termDays: null }])).toEqual([])
  })

  it("kandidat kosong = rencana kosong (idempoten sesudah apply)", () => {
    expect(planDueDateBackfill([])).toEqual([])
  })
})
