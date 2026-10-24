import { describe, it, expect } from "vitest"
import { Prisma } from "@prisma/client"

import {
  CAPITALIZATION_CAPPED_LABEL,
  CAPITALIZATION_DECISION_LABELS,
  CAPITALIZATION_FAILED_CONDITION_LABELS,
  capitalizationAppliedExtensionLabel,
  capitalizationMonthlyDepreciationLabel,
  capitalizationRemainingLifeLabel,
  capitalizationStartMonthLabel,
} from "../asset-capitalization-display"
import type { FiscalCapitalizationResult } from "../asset-capitalization"

const RESULT: FiscalCapitalizationResult = {
  fiscalBookValueAfter: new Prisma.Decimal("212500000.00"),
  appliedLifeExtensionMonths: 24,
  remainingFiscalLifeMonthsAfter: 60,
  cappedByGroupLife: false,
  monthlyFiscalDepreciation: new Prisma.Decimal("3541666.67"),
  depreciationStartMonth: "2026-01",
}

describe("asset-capitalization-display — label verbatim kontrak F-108-V", () => {
  it("keputusan capitalize vs expense berlabel resmi", () => {
    expect(CAPITALIZATION_DECISION_LABELS.capitalize).toBe("Dikapitalisasi")
    expect(CAPITALIZATION_DECISION_LABELS.expense).toBe(
      "Dibebankan sebagai beban periode",
    )
  })

  it("syarat gugur (a)-(d) berlabel lengkap", () => {
    expect(CAPITALIZATION_FAILED_CONDITION_LABELS.a).toContain("tidak aktif")
    expect(CAPITALIZATION_FAILED_CONDITION_LABELS.b).toContain("1 tahun")
    expect(CAPITALIZATION_FAILED_CONDITION_LABELS.c).toContain(
      "Manfaat masa depan",
    )
    expect(CAPITALIZATION_FAILED_CONDITION_LABELS.d).toContain(
      "dokumen sumber",
    )
  })

  it("masa manfaat baru tampil dari builder apa adanya", () => {
    expect(capitalizationRemainingLifeLabel(RESULT)).toBe(
      "Sisa masa manfaat fiskal sesudah kapitalisasi: 60 bulan",
    )
  })

  it("tambahan manfaat terpakai vs tidak menambah (E108-9)", () => {
    expect(capitalizationAppliedExtensionLabel(RESULT)).toBe(
      "Tambahan masa manfaat terpakai: 24 bulan",
    )
    expect(
      capitalizationAppliedExtensionLabel({
        ...RESULT,
        appliedLifeExtensionMonths: 0,
      }),
    ).toContain("tidak menambah")
  })

  it("plafon kelompok + beban bulanan + bulan mulai verbatim builder", () => {
    expect(CAPITALIZATION_CAPPED_LABEL).toContain("plafon")
    expect(
      capitalizationMonthlyDepreciationLabel(RESULT, "Rp 3.541.666,67"),
    ).toBe("Beban fiskal bulanan atas basis baru: Rp 3.541.666,67")
    expect(
      capitalizationMonthlyDepreciationLabel(
        { ...RESULT, monthlyFiscalDepreciation: null },
        null,
      ),
    ).toContain("belum dapat dihitung")
    expect(capitalizationStartMonthLabel(RESULT)).toBe(
      "Penyusutan atas basis baru mulai bulan 2026-01",
    )
  })
})
