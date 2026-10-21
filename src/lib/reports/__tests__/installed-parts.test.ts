import { describe, it, expect } from "vitest"

import {
  buildInstalledParts,
  type InstalledCoverageInput,
  type InstalledIssueInput,
} from "../installed-parts"

/**
 * F-2026-10-21-024 jalur b. Yang dijaga:
 * - coverage active + issue completed berserial untuk unit SAMA melebur satu
 *   baris (dedup per workOrderId+itemId+serial) — falsifikasi: cabut satu
 *   sumber, baris tetap ada tapi `source` menyempit; cabut keduanya, hilang.
 * - part non-garansi hanya dari issue; issue draft / tanpa serial tidak masuk.
 * - replaced (klaim replace disetujui) > revoked > expired > active.
 * - kendaraan tanpa part = daftar kosong, bukan error.
 */

const NOW = new Date("2026-10-21T00:00:00Z")
const D = (iso: string) => new Date(iso)

function coverage(over: Partial<InstalledCoverageInput> = {}): InstalledCoverageInput {
  return {
    id: 1, workOrderId: 10, itemId: 100, itemName: "Aki 12V", itemSku: "AKI-12",
    serialNumber: "SN-1", installedAt: D("2026-01-10"), expiresAt: D("2027-01-10"),
    status: "active", ...over,
  }
}

function issue(over: Partial<InstalledIssueInput> = {}): InstalledIssueInput {
  return {
    workOrderId: 10, date: D("2026-01-10"), status: "completed",
    lines: [{ itemId: 100, itemName: "Aki 12V", itemSku: "AKI-12", serialNumbers: ["SN-1"] }],
    ...over,
  }
}

describe("buildInstalledParts", () => {
  it("coverage + issue untuk unit sama = SATU baris sumber gabungan", () => {
    const r = buildInstalledParts({ coverages: [coverage()], issues: [issue()], claims: [] }, NOW)
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ source: "coverage+material_issue", status: "active", serialNumber: "SN-1" })
    expect(r.activeCount).toBe(1)
  })

  it("cabut coverage: baris tetap dari issue saja, tanpa masa garansi", () => {
    const r = buildInstalledParts({ coverages: [], issues: [issue()], claims: [] }, NOW)
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ source: "material_issue", warrantyExpiresAt: null })
  })

  it("cabut issue: baris tetap dari coverage saja", () => {
    const r = buildInstalledParts({ coverages: [coverage()], issues: [], claims: [] }, NOW)
    expect(r.total).toBe(1)
    expect(r.rows[0]).toMatchObject({ source: "coverage", warrantyExpiresAt: D("2027-01-10") })
  })

  it("cabut kedua sumber: daftar kosong jujur, bukan error", () => {
    const r = buildInstalledParts({ coverages: [], issues: [], claims: [] }, NOW)
    expect(r).toEqual({ rows: [], total: 0, activeCount: 0 })
  })

  it("part non-garansi dua serial dari satu baris issue = dua baris", () => {
    const r = buildInstalledParts({
      coverages: [], claims: [],
      issues: [issue({ lines: [{ itemId: 200, itemName: "Ban", itemSku: null, serialNumbers: ["B-1", "B-2", " "] }] })],
    }, NOW)
    expect(r.rows.map((x) => x.serialNumber)).toEqual(["B-1", "B-2"])
  })

  it("issue belum completed dan baris tanpa serial tidak masuk registri", () => {
    const r = buildInstalledParts({
      coverages: [], claims: [],
      issues: [
        issue({ status: "draft" }),
        issue({ workOrderId: 11, lines: [{ itemId: 300, itemName: "Oli", itemSku: null, serialNumbers: null }] }),
      ],
    }, NOW)
    expect(r.total).toBe(0)
  })

  it("klaim replace disetujui menandai replaced + WO pengganti; klaim intake tidak", () => {
    const base = { coverages: [coverage()], issues: [] }
    const intake = buildInstalledParts(
      { ...base, claims: [{ id: 5, coverageId: 1, status: "intake", resolutionType: "replace", repairWorkOrderId: null }] }, NOW)
    expect(intake.rows[0].status).toBe("active")

    const replaced = buildInstalledParts(
      { ...base, claims: [{ id: 5, coverageId: 1, status: "closed", resolutionType: "replace", repairWorkOrderId: 99 }] }, NOW)
    expect(replaced.rows[0]).toMatchObject({ status: "replaced", replacedByWorkOrderId: 99, replacementClaimId: 5 })
    expect(replaced.activeCount).toBe(0)
  })

  it("revoked dan expired (status maupun tanggal) kalah dari replaced, menang dari active", () => {
    const revoked = buildInstalledParts({ coverages: [coverage({ status: "revoked" })], issues: [], claims: [] }, NOW)
    expect(revoked.rows[0].status).toBe("revoked")

    const expiredByDate = buildInstalledParts(
      { coverages: [coverage({ expiresAt: D("2026-01-01") })], issues: [], claims: [] }, NOW)
    expect(expiredByDate.rows[0].status).toBe("expired")

    const replacedWins = buildInstalledParts({
      coverages: [coverage({ status: "revoked", expiresAt: D("2026-01-01") })], issues: [],
      claims: [{ id: 5, coverageId: 1, status: "approved", resolutionType: "replace", repairWorkOrderId: null }],
    }, NOW)
    expect(replacedWins.rows[0].status).toBe("replaced")
  })

  it("coverage ganda (workOrderId,itemId,serial sama) terdedup; serial beda tetap dua baris", () => {
    const r = buildInstalledParts({
      coverages: [coverage(), coverage({ id: 2 }), coverage({ id: 3, serialNumber: "SN-2" })],
      issues: [], claims: [],
    }, NOW)
    expect(r.total).toBe(2)
  })

  it("urut installedAt desc deterministik", () => {
    const r = buildInstalledParts({
      coverages: [
        coverage({ id: 1, workOrderId: 10, serialNumber: "SN-OLD", installedAt: D("2025-01-01") }),
        coverage({ id: 2, workOrderId: 11, serialNumber: "SN-NEW", installedAt: D("2026-06-01") }),
      ],
      issues: [], claims: [],
    }, NOW)
    expect(r.rows.map((x) => x.serialNumber)).toEqual(["SN-NEW", "SN-OLD"])
  })
})
