/**
 * F-2026-10-21-028-I §I.1/§I.3/§I.6 — ekspor internal CSV PPh21 Lapis 1.
 *
 * SATU-SATUNYA berkas yang boleh lahir: CSV rekap internal per masa.
 * BUKAN berkas ekspor DJP/e-Bupot; Lapis 2 (BPMP/BPA1/XML) DILARANG
 * dibangun sampai syarat §I.1 butir 2 terpenuhi. Pure (tanpa Prisma/DOM):
 * masukan = hasil `buildPph21Recap` dari loader rekap yang sama — modul
 * ini DILARANG query agregasi kedua (AC-9).
 *
 * Fail-closed tiga kelas (§I.6):
 * - Kelas A: ekspor ditolak total, tanpa berkas parsial.
 * - Kelas B: berkas internal terbit, label siap-impor DJP mati.
 * - Kelas C: temuan tampil di bukti, label tidak berubah.
 */

import { safeAdd } from "@/lib/utils/math"
import {
  parsePph21Period,
  type Pph21ExportRow,
  type Pph21Recap,
} from "@/lib/reports/pph21-recap"

export const PPH21_EXPORT_LABEL = "Rekap internal PPh21 — bukan berkas ekspor DJP/e-Bupot."
export const PPH21_EXPORT_HEADER =
  "masa_bulan;masa_tahun;employee_id;nama;npwp;nik;kode_ptkp;kategori_ter;kode_objek_pajak;penghasilan_bruto;tarif_ter_persen;pph21_terpotong;lebih_potong;tanggal_pemotongan;metode;jenis_masa;jumlah_slip"

export type Pph21FindingClass = "A" | "B" | "C"

export interface Pph21ExportFinding {
  class: Pph21FindingClass
  kind: string
  period: string
  employeeId: number | null
  employeeName: string
  message: string
}

/** Bukti rekonsiliasi §I.6 butir 5 — wajib menyertai berkas (tanpa bukti = draf). */
export interface Pph21ReconciliationProof {
  periods: string[]
  fileName: string
  correctionNo: number
  slips: number
  employees: number
  builderGross: number
  builderPph21: number
  fileGross: number
  filePph21: number
  /** Wajib 0; selisih > 0 sen = blokir kelas A. */
  grossDiff: number
  pph21Diff: number
  findingsA: number
  findingsB: number
  findingsC: number
  findings: Pph21ExportFinding[]
  /** false selama satu pun temuan kelas B ada (§I.6). */
  readyForDjpImport: boolean
  label: string
  exportedAt: string
  exportedBy: string | null
}

export type Pph21ExportResult =
  | { ok: true; csv: string; fileName: string; rows: Pph21ExportRow[]; proof: Pph21ReconciliationProof }
  | { ok: false; fileName: string; findings: Pph21ExportFinding[]; proof: Pph21ReconciliationProof }

const round2 = (v: number) => Math.round(v * 100) / 100
const isFinalKind = (k: string | null) => k != null && k.startsWith("final")

/** Angka berkas: tanpa pemisah ribuan, desimal titik, tepat 2 sen (§I.3). */
function money(v: number): string {
  return v.toFixed(2)
}

/** Tarif: desimal titik, maks 2 angka, tanpa % (§I.3). */
function rate(v: number): string {
  return String(round2(v))
}

/** RFC 4180 dengan pemisah `;`: bungkus bila mengandung `;`, `"`, newline. */
function csvField(v: string): string {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** NPWP/NIK digit-saja (§I.3); null = kosong, "INVALID" = selain digit sesudah strip. */
function digitsOnly(raw: string | null): string | null | "INVALID" {
  if (raw == null || raw.trim() === "") return null
  const stripped = raw.replace(/[.\-\s]/g, "")
  return /^\d+$/.test(stripped) ? stripped : "INVALID"
}

function dateInPeriod(date: string, period: string): boolean {
  const p = parsePph21Period(period)
  if (!p) return false
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  return Number(m[1]) === p.year && Number(m[2]) === p.month
}

export function pph21ExportFileName(periods: readonly string[], correctionNo = 0): string {
  const sorted = [...periods].sort()
  // Satu masa → YYYY-MM; multi-masa (ekspor tahunan) → YYYY dari masa pertama terurut.
  const base = sorted.length === 1
    ? `pph21-rekap-internal-${sorted[0]}`
    : `pph21-rekap-internal-${sorted[0]?.slice(0, 4) ?? "????"}`
  return correctionNo > 0 ? `${base}-pembetulan-${correctionNo}.csv` : `${base}.csv`
}

function rowLine(r: Pph21ExportRow): string {
  const p = parsePph21Period(r.period)!
  const npwp = digitsOnly(r.npwp)
  const nik = digitsOnly(r.nik)
  const fields = [
    String(p.month),
    String(p.year),
    r.employeeId == null ? "" : String(r.employeeId),
    r.employeeName,
    npwp == null || npwp === "INVALID" ? "" : npwp,
    nik == null || nik === "INVALID" ? "" : nik,
    r.ptkpCode ?? "",
    r.terCategory ?? "",
    r.taxObjectCode,
    money(r.gross),
    r.terRatePct == null ? "" : rate(r.terRatePct),
    money(r.pph21),
    isFinalKind(r.periodKind) && !r.overWithheldRead ? "" : money(r.overWithheld),
    r.withholdingDate ?? "",
    r.method,
    r.periodKind ?? "",
    String(r.slipCount),
  ]
  return fields.map(csvField).join(";")
}

/**
 * Bangun CSV satu masa (atau satu tahun bila `periods` > 1 masa se-tahun)
 * dari recap yang sama. `opts.expected` menimpa total builder untuk uji
 * rekonsiliasi (AC-3); produksi selalu rekonsiliasi ke recap sendiri.
 */
export function buildPph21Export(
  recap: Pph21Recap,
  periods: readonly string[],
  opts?: {
    correctionNo?: number
    exportedAt?: Date
    exportedBy?: string | null
    expected?: { gross: number; pph21: number }
  },
): Pph21ExportResult {
  const correctionNo = opts?.correctionNo ?? 0
  const fileName = pph21ExportFileName(periods, correctionNo)
  const wanted = new Set(periods)
  const rows = recap.exportRows.filter((r) => wanted.has(r.period))
  const findings: Pph21ExportFinding[] = []
  const add = (f: Pph21ExportFinding) => findings.push(f)

  const periodRows = recap.periods.filter((p) => wanted.has(p.period))
  const builderGross = round2(periodRows.reduce((s, p) => safeAdd(s, p.gross, 2), 0))
  const builderPph21 = round2(periodRows.reduce((s, p) => safeAdd(s, p.pph21, 2), 0))
  const fileGross = round2(rows.reduce((s, r) => safeAdd(s, r.gross, 2), 0))
  const filePph21 = round2(rows.reduce((s, r) => safeAdd(s, r.pph21, 2), 0))
  const expectedGross = opts?.expected ? round2(opts.expected.gross) : builderGross
  const expectedPph21 = opts?.expected ? round2(opts.expected.pph21) : builderPph21
  const grossDiff = round2(fileGross - expectedGross)
  const pph21Diff = round2(filePph21 - expectedPph21)

  for (const period of periods) {
    const prow = periodRows.find((p) => p.period === period)
    if (!prow || prow.slips === 0) {
      add({
        class: "A", kind: "empty-period", period, employeeId: null, employeeName: "",
        message: `Masa ${period}: tidak ada data slip approved/paid — ekspor ditolak, bukan berkas kosong.`,
      })
    }
  }
  if (recap.excludedSlips > 0) {
    add({
      class: "C", kind: "excluded-slips", period: periods.join(","), employeeId: null, employeeName: "",
      message: `${recap.excludedSlips} slip belum approved/paid tidak ikut ekspor.`,
    })
  }
  if (recap.unreadablePeriodSlips > 0) {
    add({
      class: "C", kind: "unreadable-period", period: periods.join(","), employeeId: null, employeeName: "",
      message: `${recap.unreadablePeriodSlips} slip approved/paid periode-nya tidak terbaca dan tidak dihitung.`,
    })
  }

  const finalByEmployeeYear = new Map<string, Pph21ExportRow[]>()
  for (const r of rows) {
    if (isFinalKind(r.periodKind)) {
      const k = `${r.period.slice(0, 4)}|${r.employeeId ?? `name:${r.employeeName}`}`
      finalByEmployeeYear.set(k, [...(finalByEmployeeYear.get(k) ?? []), r])
    }
  }

  for (const r of rows) {
    const who = { period: r.period, employeeId: r.employeeId, employeeName: r.employeeName }
    if (r.employeeName.trim() === "") {
      add({ class: "A", kind: "empty-name", ...who, message: `Masa ${r.period}: nama karyawan kosong — baris diblokir.` })
    }
    if (r.gross < 0 || r.pph21 < 0) {
      add({ class: "A", kind: "negative-amount", ...who, message: `Masa ${r.period} ${r.employeeName}: bruto/PPh21 negatif (${money(r.gross)}/${money(r.pph21)}) — angka negatif dilarang di berkas.` })
    }
    if (r.periodKind === "bulk-december-pending-final") {
      add({ class: "A", kind: "bulk-december-pending-final", ...who, message: `Masa ${r.period} ${r.employeeName}: Desember masih estimasi massal (bulk-december-pending-final) — hitung ulang masa terakhir per karyawan dulu.` })
    }
    if (r.withholdingDate == null) {
      add({ class: "A", kind: "unreadable-withholding-date", ...who, message: `Masa ${r.period} ${r.employeeName}: tanggal pemotongan tidak terbaca (paymentDate/endDate kosong).` })
    }
    if (r.employeeId == null) {
      add({ class: "C", kind: "missing-employee-id", ...who, message: `Masa ${r.period} ${r.employeeName}: employee_id kosong — identitas DJP tidak bisa diturunkan; baris warisan tergabung per nama.` })
    }
    const npwp = digitsOnly(r.npwp)
    const nik = digitsOnly(r.nik)
    if (npwp === "INVALID") add({ class: "B", kind: "invalid-npwp", ...who, message: `Masa ${r.period} ${r.employeeName}: NPWP berisi selain digit sesudah strip format.` })
    if (nik === "INVALID") add({ class: "B", kind: "invalid-nik", ...who, message: `Masa ${r.period} ${r.employeeName}: NIK berisi selain digit sesudah strip format.` })
    if (npwp == null && nik == null) {
      add({ class: "B", kind: "missing-npwp-nik", ...who, message: `Masa ${r.period} ${r.employeeName}: NPWP dan NIK dua-duanya kosong — baris tak teridentifikasi DJP.` })
    } else {
      if (npwp == null) add({ class: "B", kind: "missing-npwp", ...who, message: `Masa ${r.period} ${r.employeeName}: NPWP kosong.` })
      if (nik == null) add({ class: "B", kind: "missing-nik", ...who, message: `Masa ${r.period} ${r.employeeName}: NIK kosong.` })
    }
    if (r.ptkpCode == null) {
      add({ class: "B", kind: "ptkp-underivable", ...who, message: `Masa ${r.period} ${r.employeeName}: kode PTKP tidak dapat diturunkan dari snapshot maupun master.` })
    } else if (!r.ptkpFromSnapshot) {
      add({ class: "B", kind: "ptkp-from-master", ...who, message: `Masa ${r.period} ${r.employeeName}: kode PTKP ${r.ptkpCode} dari master saat ekspor (snapshot tak terbaca).` })
    }
    // Status HB (gabungan penghasilan istri) tak terturunkan dari field
    // berjalan (§I.4): K/<dep> tampil apa adanya — tak ditebak jadi HB.
    if (r.method === "TER" && !isFinalKind(r.periodKind)) {
      if (r.terCategory == null) add({ class: "B", kind: "missing-ter-category", ...who, message: `Masa ${r.period} ${r.employeeName}: slip TER bulanan tanpa kategori TER.` })
      if (r.terRatePct == null) add({ class: "B", kind: "missing-ter-rate", ...who, message: `Masa ${r.period} ${r.employeeName}: slip TER bulanan tanpa tarif TER.` })
    }
    if (r.method !== "TER") {
      add({ class: "B", kind: "legacy-or-unknown-method", ...who, message: `Masa ${r.period} ${r.employeeName}: metode ${r.method} — slip pra-TER/snapshot rusak, tarif & kategori kosong.` })
    }
    if (r.mixedMethods) {
      add({ class: "B", kind: "mixed-methods", ...who, message: `Masa ${r.period} ${r.employeeName}: metode campuran se-(karyawan,masa); metode ditulis dari slip terakhir.` })
    }
    if (isFinalKind(r.periodKind) && !r.overWithheldRead) {
      add({ class: "B", kind: "final-overwithheld-unread", ...who, message: `Masa ${r.period} ${r.employeeName}: masa final tanpa snapshot lebih-potong terbaca.` })
    }
    if (r.withholdingDate != null && !dateInPeriod(r.withholdingDate, r.period)) {
      add({ class: "B", kind: "date-outside-period", ...who, message: `Masa ${r.period} ${r.employeeName}: tanggal pemotongan ${r.withholdingDate} di luar masa.` })
    }
    if (r.statusDependentsMismatch) {
      add({ class: "C", kind: "status-dependents-mismatch", ...who, message: `Masa ${r.period} ${r.employeeName}: kode status PTKP ≠ kolom dependents (kolom menang, F-026 §1).` })
    }
    if (r.overWithheld > 0) {
      add({ class: "C", kind: "overwithheld-unreturned", ...who, message: `Masa ${r.period} ${r.employeeName}: lebih potong ${money(r.overWithheld)} tampil apa adanya; pengembalian = pembayaran nyata, bukan pengurang masa lain.` })
    }
  }

  for (const [k, finals] of finalByEmployeeYear) {
    if (finals.length > 1) {
      for (const r of finals) {
        add({
          class: "A", kind: "double-final-period", period: r.period, employeeId: r.employeeId, employeeName: r.employeeName,
          message: `Karyawan ${r.employeeName} punya ${finals.length} baris masa final dalam tahun ${k.slice(0, 4)} — data warisan/korupsi, ekspor diblokir.`,
        })
      }
    }
  }

  if (grossDiff !== 0 || pph21Diff !== 0) {
    add({
      class: "A", kind: "reconciliation-diff", period: periods.join(","), employeeId: null, employeeName: "",
      message: `Selisih rekonsiliasi masa ${periods.join(",")}: bruto ${money(grossDiff)}, PPh21 ${money(pph21Diff)} — wajib 0.00, ekspor diblokir.`,
    })
  }

  const proof: Pph21ReconciliationProof = {
    periods: [...periods],
    fileName,
    correctionNo,
    slips: periodRows.reduce((s, p) => s + p.slips, 0),
    employees: rows.length,
    builderGross, builderPph21, fileGross, filePph21, grossDiff, pph21Diff,
    findingsA: findings.filter((f) => f.class === "A").length,
    findingsB: findings.filter((f) => f.class === "B").length,
    findingsC: findings.filter((f) => f.class === "C").length,
    findings,
    readyForDjpImport: !findings.some((f) => f.class === "B" || f.class === "A"),
    label: PPH21_EXPORT_LABEL,
    exportedAt: (opts?.exportedAt ?? new Date()).toISOString(),
    exportedBy: opts?.exportedBy ?? null,
  }

  if (proof.findingsA > 0) return { ok: false, fileName, findings, proof }

  const csv = [PPH21_EXPORT_HEADER, ...rows.map(rowLine)].join("\r\n") + "\r\n"
  return { ok: true, csv, fileName, rows, proof }
}
