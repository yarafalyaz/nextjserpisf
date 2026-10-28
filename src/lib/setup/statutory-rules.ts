import type { Prisma } from "@prisma/client"

/**
 * Seed parameter statutori payroll 12 baris vonis F-2026-10-28-126-V §3
 * (pecahan tarif + plafon JP berperiode + PTKP + biaya jabatan).
 * Idempoten per `(key, effectiveFrom)`: baris tenant yang sudah ada
 * (termasuk edit/tutup) tidak pernah ditimpa — seed hanya mengisi
 * instalasi yang belum punya. Tanpa ini hitung/approve payroll pada
 * instalasi baru tertahan gate `fromFallback` (`getStatutoryParams`).
 *
 * Dipakai wizard install; seed CLI (`prisma/seed.ts`) menjalankan SQL setara.
 */
const STATUTORY_ROWS: {
  key: string
  value: number
  effectiveFrom: Date
  effectiveTo: Date | null
  source: string
}[] = [
  { key: "bpjs_health_employee_rate", value: 0.01, effectiveFrom: new Date("2020-07-01"), effectiveTo: null, source: "Perpres 64/2020" },
  { key: "bpjs_health_ceiling", value: 12000000, effectiveFrom: new Date("2020-07-01"), effectiveTo: null, source: "Perpres 64/2020" },
  { key: "bpjs_jht_employee_rate", value: 0.02, effectiveFrom: new Date("2015-07-01"), effectiveTo: null, source: "PP 46/2015" },
  { key: "bpjs_jp_employee_rate", value: 0.01, effectiveFrom: new Date("2015-07-01"), effectiveTo: null, source: "PP 45/2015" },
  { key: "bpjs_jp_ceiling", value: 10042300, effectiveFrom: new Date("2024-03-01"), effectiveTo: new Date("2025-02-28"), source: "surat BPJS (plafon 2024)" },
  { key: "bpjs_jp_ceiling", value: 10547400, effectiveFrom: new Date("2025-03-01"), effectiveTo: new Date("2026-02-28"), source: "surat BPJS B/91/022025" },
  { key: "bpjs_jp_ceiling", value: 11086300, effectiveFrom: new Date("2026-03-01"), effectiveTo: null, source: "surat BPJS B/962/022026" },
  { key: "ptkp_single", value: 54000000, effectiveFrom: new Date("2016-01-01"), effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "ptkp_married_extra", value: 4500000, effectiveFrom: new Date("2016-01-01"), effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "ptkp_dependent_extra", value: 4500000, effectiveFrom: new Date("2016-01-01"), effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "occupational_cost_rate", value: 0.05, effectiveFrom: new Date("2009-01-01"), effectiveTo: null, source: "PMK 250/PMK.03/2008" },
  { key: "occupational_cost_ceiling_year", value: 6000000, effectiveFrom: new Date("2009-01-01"), effectiveTo: null, source: "PMK 250/PMK.03/2008" },
]

export async function seedPayrollStatutoryRules(tx: Prisma.TransactionClient): Promise<number> {
  let created = 0
  for (const row of STATUTORY_ROWS) {
    const existing = await tx.payrollStatutoryRule.findFirst({
      where: { key: row.key, effectiveFrom: row.effectiveFrom },
      select: { id: true },
    })
    if (existing) continue
    await tx.payrollStatutoryRule.create({ data: row })
    created++
  }
  // Baris lama migrasi P1-6 (effective_from 2024-01-01) ikut ditutup agar
  // getStatutoryParams tak jatuh ke fallback — hanya bila masih NULL.
  await tx.payrollStatutoryRule.updateMany({
    where: { key: "bpjs_jp_ceiling", effectiveFrom: new Date("2024-01-01"), effectiveTo: null },
    data: { effectiveTo: new Date("2024-02-29"), source: "surat BPJS (plafon 2024)" },
  })
  return created
}
