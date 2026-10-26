// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"

import { OvertimeBaseSnapshotFields } from "../overtime-base-snapshot-fields"
import type { OvertimeBaseSnapshot } from "@/lib/reports/overtime-base-snapshot-data"
import {
  clearRenderedCards,
  renderCard,
  unmountCard,
} from "@/components/reports/__tests__/card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

const SNAPSHOT: OvertimeBaseSnapshot = {
  baseSalary: 3_460_000,
  components: [
    { name: "Tunjangan Tetap A", amount: 540_000 },
    { name: "Tunjangan Tetap B", amount: 1 },
  ],
  baseTotal: 4_000_001,
}

describe("OvertimeBaseSnapshotFields", () => {
  it("menampilkan gaji pokok, komponen, dan dasar upah lembur verbatim", () => {
    const { container, root } = renderCard(
      <OvertimeBaseSnapshotFields canViewPayroll snapshot={SNAPSHOT} />,
    )
    const text = container.textContent ?? ""

    expect(text).toContain("Gaji Pokok")
    expect(text).toContain("Rp 3.460.000")
    expect(text).toContain("Tunjangan Tetap A")
    expect(text).toContain("Rp 540.000")
    expect(text).toContain("Tunjangan Tetap B")
    expect(text).toContain("Rp 1")
    expect(text).toContain("Dasar Upah Lembur")
    expect(text).toContain("Rp 4.000.001")
    unmountCard(root)
  })

  it("snapshot null bagi pemegang izin menampilkan status tanpa nominal dasar", () => {
    const { container, root } = renderCard(
      <OvertimeBaseSnapshotFields canViewPayroll snapshot={null} />,
    )
    const text = container.textContent ?? ""

    expect(text).toContain("Dasar Upah Lembur")
    expect(text).toContain("Rincian dasar upah lembur belum tercatat untuk baris ini.")
    expect(text).not.toContain("Rp")
    expect(text).not.toContain("Gaji Pokok")
    unmountCard(root)
  })

  it("tanpa izin tidak merender rincian apa pun", () => {
    const { container, root } = renderCard(
      <OvertimeBaseSnapshotFields canViewPayroll={false} snapshot={SNAPSHOT} />,
    )
    const text = container.textContent ?? ""

    expect(text).not.toContain("Dasar Upah Lembur")
    expect(text).not.toContain("Gaji Pokok")
    expect(text).not.toContain("Tunjangan Tetap A")
    expect(text).not.toContain("Rp")
    unmountCard(root)
  })
})
