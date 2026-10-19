/**
 * Transfer Pemasok — logika murni untuk daftar instruksi transfer.
 *
 * Hasil riset (Accurate): "Transfer Pemasok" adalah **jalur eksekusi pembayaran**
 * ke pemasok (transfer bank, dengan atau tanpa Perintah Pembayaran) — bukan
 * dokumen akuntansi baru. Karena itu modulnya hanya **menandai** pembayaran vendor
 * yang transfernya sudah dikirim; jurnal kas/bank-nya sudah dibuat oleh pembayaran
 * itu sendiri.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatCurrency } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"

export interface TransferInstruction {
  vendorName: string
  amount: number
  transferredAt: Date | null
}

/** Baris yang menunggu dikirim, dan yang sudah dikirim. */
export function splitInstructions(lines: TransferInstruction[]): {
  pending: TransferInstruction[]
  transferred: TransferInstruction[]
  pendingAmount: number
  transferredAmount: number
} {
  const pending = lines.filter((line) => line.transferredAt === null)
  const transferred = lines.filter((line) => line.transferredAt !== null)
  return {
    pending,
    transferred,
    pendingAmount: pending.reduce((sum, line) => safeAdd(sum, line.amount, 2), 0),
    transferredAmount: transferred.reduce((sum, line) => safeAdd(sum, line.amount, 2), 0),
  }
}

/**
 * Menerima id pembayaran yang dicentang menjadi daftar id unik yang sah, dan
 * menolak daftar kosong secara eksplisit (bukan diam-diam tidak melakukan apa pun).
 */
export function normalizeTransferSelection(rawIds: string[]): { ids: number[]; error?: string } {
  const ids = [
    ...new Set(
      rawIds
        .map((raw) => Number(String(raw).trim()))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ]
  if (ids.length === 0) return { ids: [], error: "Pilih minimal satu pembayaran yang mau ditandai." }
  return { ids }
}

export function transferSummary(pending: number, pendingAmount: number): string {
  if (pending === 0) return "Tidak ada pembayaran yang menunggu transfer"
  return `${pending} pembayaran menunggu transfer · ${formatCurrency(pendingAmount)}`
}
