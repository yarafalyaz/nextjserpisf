// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}))

import type { Root } from "react-dom/client"

import { DisciplinaryAttentionCard } from "../disciplinary-attention-card"
import { DisciplinaryRecordsTable } from "../disciplinary-records-table"
import { renderCard, unmountCard } from "./card-test-utils"
import type { DisciplinaryRecordRow } from "@/lib/reports/disciplinary-data"

let roots: Root[] = []
afterEach(() => {
  roots.forEach((r) => unmountCard(r))
  roots = []
  document.body.replaceChildren()
})

function row(over: Partial<DisciplinaryRecordRow> = {}): DisciplinaryRecordRow {
  return {
    id: 1,
    employeeId: 10,
    employeeName: "Budi Santoso",
    departmentName: "Bengkel",
    level: "sp1",
    levelLabel: "Surat Peringatan 1 (SP1)",
    violationCategory: "mangkir tanpa keterangan berulang",
    violationDate: new Date("2026-10-01T00:00:00.000Z"),
    description: "Tidak hadir tanpa keterangan",
    regulationReference: "PP Bab III",
    workflowStatus: "issued",
    derivedStatus: "active",
    requestedBy: 99,
    requesterName: "HR",
    approvedBy: 88,
    secondApprovedBy: null,
    issuedAt: new Date("2026-10-05T00:00:00.000Z"),
    expiresAt: new Date("2027-04-05T00:00:00.000Z"),
    documentNo: "SP-0001",
    rejectionReason: null,
    acknowledgmentAt: null,
    acknowledgmentMethod: null,
    acknowledgmentRefused: false,
    employeeResponse: null,
    employeeResponseAt: null,
    employeeResponseLate: false,
    isVoidRecord: false,
    voidedAt: null,
    voidReason: null,
    createdAt: new Date("2026-10-02T00:00:00.000Z"),
    ...over,
  }
}

describe("DisciplinaryAttentionCard DISC-F1", () => {
  it("turunan server verbatim + tanpa field gaji (AC-DISC-8)", () => {
    const a = row()
    const risk = row({ id: 2, employeeId: 11, employeeName: "Siti Rahma", level: "sp3", levelLabel: "Surat Peringatan 3 (SP3)" })
    const { container, root } = renderCard(
      <DisciplinaryAttentionCard
        attention={{ active: [a, risk], expiringWithin30Days: [a], highestRisk: [risk] }}
      />,
    )
    roots.push(root)
    const text = container.textContent ?? ""
    expect(text).toContain("Surat Peringatan 1 (SP1)")
    expect(text).toContain("Surat Peringatan 3 (SP3)")
    expect(text).toContain("Aktif")
    expect(text).toContain("Risiko tertinggi")
    expect(text).toContain("Kedaluwarsa ≤30 hari")
    expect(text).toContain("2 SP aktif")
    expect(text.toLowerCase()).not.toContain("gaji")
    expect(text.toLowerCase()).not.toContain("salary")
    expect(text).not.toContain("Rp")
  })

  it("kosong tampil empty state", () => {
    const { container, root } = renderCard(
      <DisciplinaryAttentionCard attention={{ active: [], expiringWithin30Days: [], highestRisk: [] }} />,
    )
    roots.push(root)
    expect(container.textContent).toContain("Belum ada surat peringatan yang aktif")
    expect(container.querySelector("table")).toBeNull()
  })

  it("expired dirender dari derivedStatus server", () => {
    const expired = row({ derivedStatus: "expired" })
    const { container, root } = renderCard(
      <DisciplinaryRecordsTable records={[expired]} />,
    )
    roots.push(root)
    expect(container.textContent).toContain("Kedaluwarsa")
  })
})
