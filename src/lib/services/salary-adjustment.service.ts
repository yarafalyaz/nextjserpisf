import { prisma } from "@/lib/db/prisma"
import { wibDateToUtcMidnight } from "@/lib/utils/attendance-time"

/** Persentase perubahan dari gaji lama ke baru (null bila lama = 0). */
export function computeChangePercent(previous: number, next: number): number | null {
  if (previous === 0) return null
  return Math.round(((next - previous) / previous) * 10000) / 100
}

export function todayWibMidnight(): Date {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })
  return wibDateToUtcMidnight(today)
}

/**
 * Terapkan semua kenaikan terjadwal yang sudah jatuh tempo untuk satu
 * karyawan: kunci baris karyawan, terapkan berurutan tanggal efektif,
 * master baseSalary berakhir pada nilai terbaru. Mengembalikan jumlah
 * yang diterapkan. Dipanggil jalur pembuatan slip sebelum membaca
 * master, dan oleh createSalaryAdjustment untuk tanggal yang sudah lewat.
 */
export async function applyDueSalaryAdjustments(
  employeeId: number,
  asOf: Date = todayWibMidnight(),
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM employees WHERE id = ${employeeId} FOR UPDATE`
    const due = await tx.salaryAdjustment.findMany({
      where: { employeeId, status: "scheduled", effectiveDate: { lte: asOf } },
      orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
    })
    if (due.length === 0) return 0

    const employee = await tx.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { baseSalary: true },
    })
    let current = Number(employee.baseSalary)
    for (const adj of due) {
      // Snapshot gaji-sebelum diperbarui ke nilai berjalan supaya riwayat
      // tetap jujur bila master berubah sejak pencatatan.
      await tx.salaryAdjustment.update({
        where: { id: adj.id },
        data: {
          previousBaseSalary: current,
          status: "applied",
          appliedAt: new Date(),
        },
      })
      current = Number(adj.newBaseSalary)
    }
    await tx.employee.update({
      where: { id: employeeId },
      data: { baseSalary: current },
    })
    return due.length
  })
}
