import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"

import { buildPph21Recap, type Pph21RecapSlipInput } from "../pph21-recap"
import { buildPph21Export, PPH21_EXPORT_HEADER } from "../pph21-export"

/**
 * F-2026-10-21-028-I §I.7 — AC-1..AC-10 ekspor internal CSV Lapis 1.
 * AC-2 (geser kolom → MERAH) dibuktikan bentuknya: byte harapan ditulis
 * literal; memutar swapKolom() pada salinan generator membuat byte beda.
 */

const terSnap = (over: Record<string, unknown> = {}) => ({
  pph21Ter: {
    method: "TER", category: "A", ratePct: 2, periodKind: "monthly",
    overWithheld: null, maritalStatusRaw: "TK/0", dependentsClamped: 0,
    statusDependentsMismatch: false, ...over,
  },
})

function slip(partial: Partial<Pph21RecapSlipInput>): Pph21RecapSlipInput {
  return {
    employeeId: 1, employeeName: "Andi", npwp: "01.234.567.8-091.000",
    nik: "3201234567890001", maritalStatus: "TK/0", dependents: 0,
    period: "2026-01", status: "approved", type: "REGULAR",
    grossSalary: 10_000_000, pph21: 200_000, netSalary: 9_800_000,
    statutorySnapshot: terSnap(), paymentDate: "2026-01-31", endDate: "2026-01-31",
    ...partial,
  }
}

const HEADER = PPH21_EXPORT_HEADER

/** Salinan generator dengan kolom bruto↔pph21 tertukar (mutasi AC-2). */
function swapKolom(csv: string): string {
  return csv.split("\r\n").map((line, i) => {
    if (i === 0 || line === "") return line
    const cells: string[] = []
    let cur = "", quoted = false
    for (let j = 0; j < line.length; j++) {
      const c = line[j]
      if (quoted) { cur += c; if (c === '"') { if (line[j + 1] === '"') { cur += line[++j] } else quoted = false } }
      else if (c === '"') { quoted = true; cur += c }
      else if (c === ";") { cells.push(cur); cur = "" }
      else cur += c
    }
    cells.push(cur)
    ;[cells[9], cells[11]] = [cells[11], cells[9]]
    return cells.join(";")
  }).join("\r\n")
}

describe("AC-1 byte-persis + AC-8 determinisme", () => {
  const fixture = () => buildPph21Recap([
    slip({}),
    slip({ type: "THR", grossSalary: 5_000_000, pph21: 100_000, netSalary: 4_900_000 }),
    slip({
      employeeId: 2, employeeName: "Budi", npwp: "02.345.678.9-091.000", nik: "3201234567890002",
      grossSalary: 8_000_000, pph21: 160_000, netSalary: 7_840_000,
      statutorySnapshot: terSnap({ category: "B", maritalStatusRaw: "K/1", dependentsClamped: 1 }),
      maritalStatus: "K/1", dependents: 1,
    }),
  ])

  it("berkas sama byte-per-byte dengan harapan tertulis (REGULAR+THR tergabung 1 baris)", () => {
    const r = buildPph21Export(fixture(), ["2026-01"])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const expected =
      HEADER + "\r\n" +
      "1;2026;1;Andi;012345678091000;3201234567890001;TK/0;A;21-100-01;15000000.00;2;300000.00;0.00;2026-01-31;TER;monthly;2\r\n" +
      "1;2026;2;Budi;023456789091000;3201234567890002;K/1;B;21-100-01;8000000.00;2;160000.00;0.00;2026-01-31;TER;monthly;1\r\n"
    expect(r.csv).toBe(expected)
    expect(r.csv.charCodeAt(0)).not.toBe(0xfeff) // tanpa BOM
    expect(r.fileName).toBe("pph21-rekap-internal-2026-01.csv")
    expect(r.proof).toMatchObject({ slips: 3, employees: 2, grossDiff: 0, pph21Diff: 0, findingsA: 0, findingsB: 0, readyForDjpImport: true })
    expect(r.rows[0]).toMatchObject({ slipCount: 2, slipTypes: ["REGULAR", "THR"] })
  })

  it("AC-2: geser/tukar satu kolom membuat byte beda (tes byte-persis pasti MERAH)", () => {
    const r = buildPph21Export(fixture(), ["2026-01"])
    if (!r.ok) throw new Error("fixture harus lolos")
    expect(swapKolom(r.csv)).not.toBe(r.csv)
  })

  it("AC-8: ekspor ulang hash sama; correctionNo → nama pembetulan-1", () => {
    const a = buildPph21Export(fixture(), ["2026-01"])
    const b = buildPph21Export(fixture(), ["2026-01"])
    if (!a.ok || !b.ok) throw new Error("fixture harus lolos")
    const h = (s: string) => createHash("sha256").update(s).digest("hex")
    expect(h(a.csv)).toBe(h(b.csv))
    const c = buildPph21Export(fixture(), ["2026-01"], { correctionNo: 1 })
    if (!c.ok) throw new Error("fixture harus lolos")
    expect(c.fileName).toBe("pph21-rekap-internal-2026-01-pembetulan-1.csv")
    expect(a.fileName).toBe("pph21-rekap-internal-2026-01.csv")
  })
})

describe("AC-3 rekonsiliasi persis sen", () => {
  it("Σ baris == builder; expected digeser +0,01 → blokir kelas A selisih", () => {
    const recap = buildPph21Recap([slip({}), slip({ employeeId: 2, employeeName: "Budi", pph21: 0.01 })])
    const ok = buildPph21Export(recap, ["2026-01"])
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.proof).toMatchObject({ builderPph21: 200_000.01, filePph21: 200_000.01, pph21Diff: 0 })

    // Cabut penjaga = expected digeser: gerbang WAJIB menolak dengan selisih.
    const bad = buildPph21Export(recap, ["2026-01"], { expected: { gross: 20_000_000, pph21: 200_000.02 } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.findings.some((f) => f.class === "A" && f.kind === "reconciliation-diff")).toBe(true)
      expect("csv" in bad).toBe(false)
    }
  })

  it("baris ganda se-(karyawan,masa) mustahil: 2 slip → 1 baris (AC-2 kontrak §I.2)", () => {
    const recap = buildPph21Recap([slip({}), slip({ type: "THR" })])
    expect(recap.exportRows).toHaveLength(1)
  })
})

describe("AC-4/AC-5/AC-6 gerbang masa", () => {
  it("AC-4: bulk-december-pending-final blokir masa 2026-12; 2026-11 tetap bisa", () => {
    const recap = buildPph21Recap([
      slip({ period: "2026-11", paymentDate: "2026-11-30", endDate: "2026-11-30" }),
      slip({ period: "2026-12", paymentDate: "2026-12-31", endDate: "2026-12-31", statutorySnapshot: terSnap({ periodKind: "bulk-december-pending-final" }) }),
    ])
    const dec = buildPph21Export(recap, ["2026-12"])
    expect(dec.ok).toBe(false)
    if (!dec.ok) expect(dec.findings.some((f) => f.class === "A" && f.kind === "bulk-december-pending-final" && f.message.includes("hitung ulang masa terakhir"))).toBe(true)
    expect(buildPph21Export(recap, ["2026-11"]).ok).toBe(true)
  })

  it("AC-5: final-december & final-resignation — tarif kosong, lebih_potong terisi", () => {
    const recap = buildPph21Recap([
      slip({ period: "2026-12", paymentDate: "2026-12-31", endDate: "2026-12-31", statutorySnapshot: terSnap({ periodKind: "final-december", ratePct: null, overWithheld: 50_000 }) }),
      slip({ employeeId: 2, employeeName: "Budi", period: "2026-06", paymentDate: "2026-06-30", endDate: "2026-06-30", statutorySnapshot: terSnap({ periodKind: "final-resignation", ratePct: null, overWithheld: 25_000 }) }),
    ])
    const dec = buildPph21Export(recap, ["2026-12"])
    if (!dec.ok) throw new Error(JSON.stringify(dec.findings))
    expect(dec.csv).toContain(";21-100-01;10000000.00;;200000.00;50000.00;2026-12-31;TER;final-december;1\r\n")
    const jun = buildPph21Export(recap, ["2026-06"])
    if (!jun.ok) throw new Error(JSON.stringify(jun.findings))
    expect(jun.csv).toContain(";25000.00;2026-06-30;TER;final-resignation;1\r\n")
  })

  it("AC-6: masa kosong / hanya draft → ditolak 'tidak ada data', tanpa berkas", () => {
    const recap = buildPph21Recap([slip({ status: "draft" })])
    const r = buildPph21Export(recap, ["2026-01"])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.findings.some((f) => f.kind === "empty-period")).toBe(true)
      expect(r.proof.findings.some((f) => f.kind === "excluded-slips")).toBe(true)
    }
  })

  it("dua masa final se-karyawan setahun → blokir kelas A", () => {
    const recap = buildPph21Recap([
      slip({ period: "2026-06", paymentDate: "2026-06-30", endDate: "2026-06-30", statutorySnapshot: terSnap({ periodKind: "final-resignation", ratePct: null, overWithheld: 0 }) }),
      slip({ period: "2026-12", paymentDate: "2026-12-31", endDate: "2026-12-31", statutorySnapshot: terSnap({ periodKind: "final-december", ratePct: null, overWithheld: 0 }) }),
    ])
    const r = buildPph21Export(recap, ["2026-06", "2026-12"])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.findings.some((f) => f.kind === "double-final-period")).toBe(true)
  })

  it("tanggal tak terbaca & angka negatif → blokir kelas A", () => {
    const noDate = buildPph21Export(buildPph21Recap([slip({ paymentDate: null, endDate: null })]), ["2026-01"])
    expect(noDate.ok).toBe(false)
    const neg = buildPph21Export(buildPph21Recap([slip({ pph21: -1 })]), ["2026-01"])
    expect(neg.ok).toBe(false)
    if (!neg.ok) expect(neg.findings.some((f) => f.kind === "negative-amount")).toBe(true)
  })
})

describe("AC-7 kelas B + AC-10 kutip & identitas", () => {
  it("AC-7: NPWP+NIK kosong → berkas terbit, label siap-impor mati; perbaiki master → bersih, angka sama", () => {
    const before = buildPph21Export(buildPph21Recap([slip({ npwp: null, nik: null })]), ["2026-01"])
    if (!before.ok) throw new Error(JSON.stringify(before.findings))
    expect(before.csv).toContain(";1;Andi;;;TK/0;")
    expect(before.proof.readyForDjpImport).toBe(false)
    expect(before.proof.findingsB).toBeGreaterThan(0)

    const after = buildPph21Export(buildPph21Recap([slip({})]), ["2026-01"])
    if (!after.ok) throw new Error("harus lolos")
    expect(after.proof.readyForDjpImport).toBe(true)
    expect(after.proof.fileGross).toBe(before.proof.fileGross)
    expect(after.proof.filePph21).toBe(before.proof.filePph21)
  })

  it("AC-10: nama mengandung ; dan \" ter-escape RFC4180; NPWP huruf → kelas B bukan dibersihkan", () => {
    const recap = buildPph21Recap([slip({ employeeName: 'An;di "X"', npwp: "01.234.ABC" })])
    const r = buildPph21Export(recap, ["2026-01"])
    if (!r.ok) throw new Error(JSON.stringify(r.findings))
    expect(r.csv).toContain('"An;di ""X"""')
    expect(r.proof.findings.some((f) => f.class === "B" && f.kind === "invalid-npwp")).toBe(true)
    expect(r.proof.readyForDjpImport).toBe(false)
  })

  it("slip legacy tanpa snapshot: metode LEGACY/UNKNOWN apa adanya, tarif kosong (I.5.6)", () => {
    const recap = buildPph21Recap([slip({ statutorySnapshot: { pph21Ter: { method: "LEGACY_PRE_TER" } } })])
    const r = buildPph21Export(recap, ["2026-01"])
    if (!r.ok) throw new Error(JSON.stringify(r.findings))
    expect(r.csv).toContain(";;200000.00;0.00;2026-01-31;LEGACY_PRE_TER;;1\r\n")
    expect(r.proof.findings.some((f) => f.kind === "legacy-or-unknown-method")).toBe(true)
  })
})

// ── AC-9 satu sumber: ekspor lewat loader rekap yang sama ────────────────────
const mocks = vi.hoisted(() => ({ prismaMock: { payroll: { findMany: vi.fn() } } }))
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

describe("AC-9 wiring loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.payroll.findMany.mockResolvedValue([{
      employeeId: 1, period: "2026-01", status: "approved", type: "REGULAR",
      grossSalary: 10_000_000, pph21: 200_000, netSalary: 9_800_000,
      statutorySnapshot: terSnap(), paymentDate: new Date("2026-01-31T00:00:00"), endDate: new Date("2026-01-31T00:00:00"),
      employee: { name: "Andi", npwp: "01.234.567.8-091.000", idNumber: "3201234567890001", maritalStatus: "TK/0", dependents: 0, position: { name: "Staff" } },
    }])
  })

  it("loadPph21Export: tepat 1x findMany payroll dengan select field ekspor", async () => {
    const { loadPph21Export } = await import("../pph21-recap-data")
    const r = await loadPph21Export({ start: new Date("2026-01-01"), end: new Date("2026-12-31") }, ["2026-01"])
    expect(mocks.prismaMock.payroll.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.payroll.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        type: true, paymentDate: true, endDate: true,
        employee: { select: expect.objectContaining({ idNumber: true, maritalStatus: true, dependents: true }) },
      }),
    }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.csv).toContain("1;2026;1;Andi;012345678091000;")
  })
})
