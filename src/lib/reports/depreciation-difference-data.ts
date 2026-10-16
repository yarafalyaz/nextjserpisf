/**
 * Pemuatan data untuk laporan **Perbedaan Penyusutan (akuntansi vs pajak)**.
 *
 * Membaca aset yang belum dilepas beserta kategorinya (tarif/umur akuntansi dan
 * fiskal). Aset yang sudah dilepas tidak lagi disusutkan, jadi tidak diikutkan.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildDepreciationDifference,
  type DepreciationAssetInput,
  type DepreciationDifferenceResult,
} from "@/lib/reports/depreciation-difference"

export interface DepreciationDifferenceReport {
  report: DepreciationDifferenceResult
}

export async function loadDepreciationDifference(): Promise<DepreciationDifferenceReport> {
  const assets = await prisma.asset.findMany({
    where: { status: { not: "disposed" } },
    select: {
      code: true,
      name: true,
      purchaseCost: true,
      currentValue: true,
      residualValue: true,
      depreciationMethod: true,
      category: {
        select: {
          name: true,
          depreciationRate: true,
          usefulLife: true,
          taxDepreciationRate: true,
          taxUsefulLife: true,
        },
      },
    },
    orderBy: { code: "asc" },
  })

  const inputs: DepreciationAssetInput[] = assets.map((asset) => ({
    code: asset.code,
    name: asset.name,
    categoryName: asset.category?.name ?? null,
    purchaseCost: Number(asset.purchaseCost),
    currentValue: Number(asset.currentValue),
    residualValue: Number(asset.residualValue),
    depreciationMethod: asset.depreciationMethod,
    categoryDepreciationRate: asset.category?.depreciationRate
      ? Number(asset.category.depreciationRate)
      : null,
    categoryUsefulLife: asset.category?.usefulLife ?? null,
    taxDepreciationRate: asset.category?.taxDepreciationRate
      ? Number(asset.category.taxDepreciationRate)
      : null,
    taxUsefulLife: asset.category?.taxUsefulLife ?? null,
  }))

  return { report: buildDepreciationDifference(inputs) }
}
