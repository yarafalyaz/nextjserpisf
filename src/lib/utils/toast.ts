"use client"

import { toast } from "sonner"

export function showSuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export function showError(message: string, description?: string) {
  toast.error(message, { description })
}

/**
 * F-2026-10-28-157-V: warning server (nomor faktur belum diisi +
 * completedOrderNotice) tampil apa adanya, tanpa hitung ulang di UI.
 * Dipakai ProcessButton + ActionDropdown — satu sumber, bukan duplikat.
 */
export function showProcessResult(
  result: { success: boolean; warning?: string } | void,
  successMessage: string,
) {
  if (result && typeof result.warning === "string" && result.warning) {
    showError(result.warning)
  } else {
    showSuccess(successMessage)
  }
}

