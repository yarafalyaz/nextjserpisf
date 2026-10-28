import type { Prisma } from "@prisma/client"

/**
 * Baris parameter statutori payroll berperiode (`payroll_statutory_rules`).
 * Angka MENGIKAT dari vonis F-2026-10-28-126-V §3 — tarif pecahan (0.01),
 * bukan persen; plafon/PTKP rupiah penuh. Idempoten per (key, effectiveFrom):
 * baris yang sudah ada (termasuk hasil edit tenant / tutup via
 * closeStatutoryRule) tidak pernah ditimpa — seed hanya mengisi yang belum ada.
 *
 * Dipakai wizard install; seed CLI (`prisma/seed.ts`) menjalankan SQL setara.
 */
export interface StatutoryRuleSeedRow {
  key: string
  value: number
  effectiveFrom: string // YYYY-MM-DD
  effectiveTo: string | null
  source: string
}

export const PAYROLL_STATUTORY_RULES_SEED: StatutoryRuleSeedRow[] = [
  { key: "bpjs_health_employee_rate", value: 0.01, effectiveFrom: "2020-07-01", effectiveTo: null, source: "Perpres 64/2020" },
  { key: "bpjs_health_ceiling", value: 12000000, effectiveFrom: "2020-07-01", effectiveTo: null, source: "Perpres 64/2020" },
  { key: "bpjs_jht_employee_rate", value: 0.02, effectiveFrom: "2015-07-01", effectiveTo: null, source: "PP 46/2015" },
  { key: "bpjs_jp_employee_rate", value: 0.01, effectiveFrom: "2015-07-01", effectiveTo: null, source: "PP 45/2015" },
  { key: "bpjs_jp_ceiling", value: 10042300, effectiveFrom: "2024-03-01", effectiveTo: "2025-02-28", source: "surat BPJS (plafon 2024)" },
  { key: "bpjs_jp_ceiling", value: 10547400, effectiveFrom: "2025-03-01", effectiveTo: "2026-02-28", source: "surat BPJS B/91/022025" },
  { key: "bpjs_jp_ceiling", value: 11086300, effectiveFrom: "2026-03-01", effectiveTo: null, source: "surat BPJS B/962/022026" },
  { key: "ptkp_single", value: 54000000, effectiveFrom: "2016-01-01", effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "ptkp_married_extra", value: 4500000, effectiveFrom: "2016-01-01", effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "ptkp_dependent_extra", value: 4500000, effectiveFrom: "2016-01-01", effectiveTo: null, source: "PMK 101/PMK.010/2016" },
  { key: "occupational_cost_rate", value: 0.05, effectiveFrom: "2009-01-01", effectiveTo: null, source: "PMK 250/PMK.03/2008" },
  { key: "occupational_cost_ceiling_year", value: 6000000, effectiveFrom: "2009-01-01", effectiveTo: null, source: "PMK 250/PMK.03/2008" },
]

export async function seedPayrollStatutoryRules(tx: Prisma.TransactionClient): Promise<number> {
  let created = 0
  for (const r of PAYROLL_STATUTORY_RULES_SEED) {
    const existing = await tx.payrollStatutoryRule.findUnique({
      where: { key_effectiveFrom: { key: r.key, effectiveFrom: new Date(r.effectiveFrom) } },
      select: { id: true },
    })
    if (existing) continue
    await tx.payrollStatutoryRule.create({
      data: {
        key: r.key,
        value: r.value,
        effectiveFrom: new Date(r.effectiveFrom),
        effectiveTo: r.effectiveTo ? new Date(r.effectiveTo) : null,
        source: r.source,
      },
    })
    created++
  }
  return created
}
