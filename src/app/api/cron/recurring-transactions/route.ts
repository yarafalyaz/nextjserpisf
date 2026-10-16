import { NextResponse } from "next/server"
import { isValidCronRequest } from "@/lib/security/cron"
import { runDueRecurring } from "@/lib/services/recurring.service"
import { apiError } from "@/lib/api-response"

/**
 * Cron: generate documents for every due recurring transaction.
 * Schedule: daily at 01:00 (0 1 * * *).
 *
 * Documents are created as DRAFTS on purpose — the scheduler must never post to
 * stock or the general ledger without a human reviewing the generated document.
 */
export async function GET(request: Request) {
  if (!isValidCronRequest(request)) {
    return apiError("UNAUTHORIZED", "Tidak terotorisasi")
  }

  try {
    const result = await runDueRecurring(new Date(), null)
    return NextResponse.json({
      success: true,
      processed: result.processed,
      generated: result.generated,
      errors: result.errors,
    })
  } catch (error) {
    console.error("[cron/recurring-transactions]", error)
    return apiError("INTERNAL_ERROR", "Gagal menjalankan transaksi berulang")
  }
}
