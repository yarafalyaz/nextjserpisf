/**
 * Rekap upah borongan per teknisi (F-2026-10-20-97a, tahap backend aman).
 *
 * PUTUSAN manager + vonis Salsa (20:47): rekap ini INFORMATIF saja — sah
 * sebagai bahan tinjauan, BUKAN dasar bayar, BUKAN dasar jurnal, dan TIDAK
 * boleh memicu baris payroll/Appreciation/kas. Borongan = bruto pegawai
 * yang kelak masuk gross payroll (PPh21 gabungan); HPP tetap satu jalur
 * `ProductionCost` saat baris labor lahir (`onProductionCostAbsorbed`),
 * jadi rekap tidak menghitung ulang apa pun — ia hanya menjumlah snapshot
 * `amount` baris labor yang sudah ada.
 *
 * Atribusi teknisi hanya lewat rantai yang benar-benar tertulis:
 * `ProductionCost.sourceTimesheetId -> Timesheet.employeeId`. Baris labor
 * manual tanpa `sourceTimesheetId` (atau timesheet-nya sudah tidak ada)
 * tampil di kelompok terpisah tanpa nama teknisi — teknisi tidak ditebak
 * dari createdBy/deskripsi, karena menebak = membayar orang yang salah.
 *
 * Hanya `category = "labor"` yang dihitung; kategori lain (machine,
 * overhead, subcontract, dsb.) bukan upah borongan teknisi.
 *
 * Pure (tanpa Prisma/DOM); loader massalnya ada di
 * `labor-recap-data.ts`.
 */

export const LABOR_RECAP_NOTICE =
  "Rekap informatif — bukan dasar pembayaran, bukan dasar jurnal, " +
  "dan tidak membuat baris payroll secara otomatis."

export interface LaborRecapCostInput {
  /** Teknisi hasil join sourceTimesheetId -> Timesheet.employeeId; null = tanpa sumber. */
  employeeId: number | null
  employeeName: string | null
  category: string
  hours: number | null
  amount: number
  /**
   * Tanggal kerja dari Timesheet.date (F-038). null = tanggal belum terbukti
   * (baris manual tanpa timesheet / timesheet hilang) — jangan tebak dari
   * createdAt. Opsional agar pemanggil lama tanpa tanggal tetap jalan.
   */
  workDate?: Date | null
}

export interface LaborRecapPeriod {
  start: Date
  end: Date
}

export interface LaborRecapTechnician {
  employeeId: number
  employeeName: string | null
  /** Σ hours baris labor teknisi ini. */
  laborHours: number
  /** Σ amount snapshot baris labor teknisi ini. */
  totalAmount: number
  lineCount: number
}

export interface LaborRecapUnattributed {
  laborHours: number
  totalAmount: number
  lineCount: number
}

export interface LaborRecap {
  notice: string
  technicians: LaborRecapTechnician[]
  /** Baris labor tanpa sourceTimesheetId / timesheet hilang — tanpa teknisi. */
  unattributed: LaborRecapUnattributed
  /** Baris labor tanggal kerja belum terbukti; di luar total bila periode aktif (F-038). */
  undated: LaborRecapUnattributed
  totalLaborHours: number
  totalAmount: number
  totalLineCount: number
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function buildLaborRecap(
  costs: readonly LaborRecapCostInput[],
  period?: LaborRecapPeriod,
): LaborRecap {
  const perTechnician = new Map<
    number,
    { employeeName: string | null; hours: number; amount: number; lineCount: number }
  >()
  const unattributed = { laborHours: 0, totalAmount: 0, lineCount: 0 }
  const undated = { laborHours: 0, totalAmount: 0, lineCount: 0 }
  let totalLaborHours = 0
  let totalAmount = 0
  let totalLineCount = 0

  for (const cost of costs) {
    if (cost.category !== "labor") continue
    const hours = cost.hours ?? 0
    // F-038: periode aktif — baris bertanggal di luar rentang dibuang;
    // baris tanpa tanggal terbukti masuk undated, BUKAN total periode.
    if (period) {
      const workDate = cost.workDate ?? null
      if (workDate === null) {
        undated.laborHours += hours
        undated.totalAmount += cost.amount
        undated.lineCount += 1
        continue
      }
      if (workDate < period.start || workDate > period.end) continue
    }
    totalLaborHours += hours
    totalAmount += cost.amount
    totalLineCount += 1
    if (cost.employeeId === null) {
      unattributed.laborHours += hours
      unattributed.totalAmount += cost.amount
      unattributed.lineCount += 1
      continue
    }
    const acc = perTechnician.get(cost.employeeId) ?? {
      employeeName: cost.employeeName,
      hours: 0,
      amount: 0,
      lineCount: 0,
    }
    // Nama pertama yang tidak kosong menang; jangan timpa nama sah dengan null.
    if (acc.employeeName === null && cost.employeeName !== null) {
      acc.employeeName = cost.employeeName
    }
    acc.hours += hours
    acc.amount += cost.amount
    acc.lineCount += 1
    perTechnician.set(cost.employeeId, acc)
  }

  const technicians: LaborRecapTechnician[] = [...perTechnician.entries()]
    .map(([employeeId, acc]) => ({
      employeeId,
      employeeName: acc.employeeName,
      laborHours: round2(acc.hours),
      totalAmount: round2(acc.amount),
      lineCount: acc.lineCount,
    }))
    .sort((a, b) => {
      const nameA = a.employeeName ?? ""
      const nameB = b.employeeName ?? ""
      if (nameA !== nameB) return nameA < nameB ? -1 : 1
      return a.employeeId - b.employeeId
    })

  return {
    notice: LABOR_RECAP_NOTICE,
    technicians,
    unattributed: {
      laborHours: round2(unattributed.laborHours),
      totalAmount: round2(unattributed.totalAmount),
      lineCount: unattributed.lineCount,
    },
    undated: {
      laborHours: round2(undated.laborHours),
      totalAmount: round2(undated.totalAmount),
      lineCount: undated.lineCount,
    },
    totalLaborHours: round2(totalLaborHours),
    totalAmount: round2(totalAmount),
    totalLineCount,
  }
}
