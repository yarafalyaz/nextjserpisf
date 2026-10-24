"use server"

/**
 * Pratinjau selisih ganti revisi BOM (F-2026-10-22-068-S, t_b60d664d).
 * Bungkus tipis loader existing `loadBomRevisionChangeDelta`
 * (bom-revision-change-delta-data.ts) supaya client component dapat
 * pratinjau sebelum kirim. Read-only; izin lihat mengikuti dokumen
 * pemilik persis pola listBomRevisionChangeRequests (BOT 3 PR #589).
 * Hasil builder ditampilkan apa adanya — tanpa hitung ulang di sini/UI,
 * tanpa reservasi (BR-BOM68-10).
 */

import { requirePermission } from "@/lib/auth/permissions"
import { getErrorMessage, isNextRedirectError } from "@/lib/utils/error"
import {
  loadBomRevisionChangeDelta,
  type BomRevisionChangeDelta,
} from "@/lib/reports/bom-revision-change-delta-data"

export async function previewBomRevisionChangeDelta(input: {
  workOrderId?: number
  productionOrderId?: number
  toRevisionId: number
}): Promise<
  | { success: true; delta: BomRevisionChangeDelta | null }
  | { success: false; error: string }
> {
  try {
    const hasWo = input.workOrderId != null
    const hasPo = input.productionOrderId != null
    if (hasWo === hasPo) {
      return {
        success: false,
        error: "Tentukan tepat satu dokumen pemilik: perintah kerja atau order produksi.",
      }
    }
    await requirePermission(hasWo ? "view_work_orders" : "view_production_orders")
    const delta = await loadBomRevisionChangeDelta(input)
    return { success: true, delta }
  } catch (error) {
    if (isNextRedirectError(error)) throw error
    return { success: false, error: getErrorMessage(error) }
  }
}
