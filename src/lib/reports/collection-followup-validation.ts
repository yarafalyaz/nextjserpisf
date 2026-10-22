/**
 * Validasi murni catat tindak lanjut penagihan (F-2026-10-22-089-S tahap 2,
 * PUTUSAN BOT 1 Q-COL-2). Dipisah dari aksi supaya teruji tanpa DB/auth.
 *
 * - channel/outcome wajib kosakata final Q-COL-2; nilai lain ditolak.
 * - `terhubung_janji_bayar` WAJIB promisedDate >= tanggal tindak lanjut
 *   (hari kalender WIB, AC-COL-11); outcome lain promisedDate kosong.
 * - promisedAmount bila terisi wajib > 0 presisi sen (AC-COL-11).
 */

import {
  COLLECTION_CHANNELS,
  COLLECTION_OUTCOMES,
} from "@/lib/reports/collection-queue"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

export interface CollectionFollowUpWriteInput {
  salesInvoiceId: number
  /** Tanggal kejadian "YYYY-MM-DD" (hari kalender WIB). */
  followedUpAt: string
  channel: string
  outcome: string
  /** "YYYY-MM-DD" — wajib untuk outcome janji, kosong untuk outcome lain. */
  promisedDate?: string | null
  promisedAmount?: number | null
  notes?: string | null
}

export interface ValidatedCollectionFollowUp {
  salesInvoiceId: number
  followedUpAt: Date
  channel: string
  outcome: string
  promisedDate: Date | null
  /** Presisi sen; null bila tidak dijanjikan nominal. */
  promisedAmount: number | null
  notes: string | null
}

function parseDateOnly(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} wajib format YYYY-MM-DD.`)
  }
  const [year, month, day] = value.split("-").map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} bukan tanggal kalender yang valid.`)
  }
  return parsed
}

export function validateCollectionFollowUpInput(
  input: CollectionFollowUpWriteInput,
): ValidatedCollectionFollowUp {
  if (
    !Number.isSafeInteger(input.salesInvoiceId) ||
    input.salesInvoiceId <= 0
  ) {
    throw new Error("Faktur wajib dipilih.")
  }
  if (
    !(COLLECTION_CHANNELS as readonly string[]).includes(input.channel)
  ) {
    throw new Error("Kanal tindak lanjut tidak dikenal.")
  }
  if (
    !(COLLECTION_OUTCOMES as readonly string[]).includes(input.outcome)
  ) {
    throw new Error("Hasil tindak lanjut tidak dikenal.")
  }

  const followedUpAt = parseDateOnly(input.followedUpAt, "Tanggal tindak lanjut")

  let promisedDate: Date | null = null
  if (input.outcome === "terhubung_janji_bayar") {
    if (!input.promisedDate) {
      throw new Error(
        "Hasil janji bayar wajib membawa tanggal janji bayar.",
      )
    }
    promisedDate = parseDateOnly(input.promisedDate, "Tanggal janji bayar")
    // AC-COL-11/Q-COL-2: janji tidak boleh sebelum hari tindak lanjut (WIB).
    if (
      getWibTodayUtcDate(promisedDate).getTime() <
      getWibTodayUtcDate(followedUpAt).getTime()
    ) {
      throw new Error(
        "Tanggal janji bayar tidak boleh sebelum tanggal tindak lanjut.",
      )
    }
  } else if (input.promisedDate) {
    throw new Error(
      "Tanggal janji bayar hanya untuk hasil terhubung dengan janji bayar.",
    )
  }

  let promisedAmount: number | null = null
  if (input.promisedAmount != null) {
    if (
      typeof input.promisedAmount !== "number" ||
      !Number.isFinite(input.promisedAmount) ||
      safeAdd(input.promisedAmount, 0, 2) <= 0
    ) {
      throw new Error("Nominal janji bayar harus lebih dari 0.")
    }
    promisedAmount = safeAdd(input.promisedAmount, 0, 2)
  }

  const notes = input.notes?.trim() ? input.notes.trim() : null
  if (notes != null && notes.length > 2000) {
    throw new Error("Catatan tindak lanjut maksimal 2000 karakter.")
  }

  return {
    salesInvoiceId: input.salesInvoiceId,
    followedUpAt,
    channel: input.channel,
    outcome: input.outcome,
    promisedDate,
    promisedAmount,
    notes,
  }
}
