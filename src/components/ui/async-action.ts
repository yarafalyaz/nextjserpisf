"use client"

import { showError } from "@/lib/utils/toast"

/**
 * Menjalankan aksi asinkron di dalam startTransition dengan penanganan galat
 * eksplisit agar penolakan jaringan atau sesi kedaluwarsa tidak hilang menjadi
 * unhandled rejection tanpa umpan balik ke pengguna.
 */
export async function runUiAction(
  task: () => Promise<void>,
  fallbackMessage: string,
  onFinally?: () => void,
): Promise<void> {
  try {
    await task()
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }
    showError(error instanceof Error && error.message ? error.message : fallbackMessage)
  } finally {
    onFinally?.()
  }
}
