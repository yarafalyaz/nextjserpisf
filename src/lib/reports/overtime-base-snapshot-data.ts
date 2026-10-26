/**
 * Loader rincian dasar upah lembur Pasal 32 per pengajuan
 * (F-2026-10-25-024-S, BR-OT-09/BR-OT-11/BR-OT-12).
 *
 * Mengembalikan snapshot yang dibekukan approveOvertime pada kolom
 * `overtimeBaseSnapshot` apa adanya (verbatim, TANPA hitung ulang dan
 * TANPA membaca master komponen berjalan) untuk halaman detail lembur.
 *
 * Gerbang gaji di server: snapshot hanya dibaca dari DB dan dikembalikan
 * bila pemanggil memegang izin `view_payroll`. Tanpa izin itu fungsi ini
 * mengembalikan null TANPA query — snapshot tidak ikut payload ke UI sama
 * sekali (bukan dikirim lalu disembunyikan di client).
 *
 * Null juga berarti: baris tidak ditemukan, atau baris approved sebelum
 * snapshot ada (tanpa backfill — nilai approved beku, rincian tidak
 * dikarang dari master kini), atau isi snapshot tidak berbentuk kontrak.
 * Loader rekap BR-OVR-12 sengaja tidak disentuh.
 */

import { prisma } from "@/lib/db/prisma"
import { hasPermission } from "@/lib/auth/permissions"

export interface OvertimeBaseSnapshot {
  baseSalary: number
  components: { name: string; amount: number }[]
  baseTotal: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function parseSnapshot(raw: unknown): OvertimeBaseSnapshot | null {
  if (!isRecord(raw)) return null
  const { baseSalary, components, baseTotal } = raw
  if (typeof baseSalary !== "number" || !Number.isFinite(baseSalary)) return null
  if (typeof baseTotal !== "number" || !Number.isFinite(baseTotal)) return null
  if (!Array.isArray(components)) return null
  const parsed: { name: string; amount: number }[] = []
  for (const c of components) {
    if (!isRecord(c)) return null
    if (typeof c.name !== "string") return null
    if (typeof c.amount !== "number" || !Number.isFinite(c.amount)) return null
    parsed.push({ name: c.name, amount: c.amount })
  }
  return { baseSalary, components: parsed, baseTotal }
}

export async function loadOvertimeBaseSnapshot(
  overtimeId: number,
): Promise<OvertimeBaseSnapshot | null> {
  if (!(await hasPermission("view_payroll"))) return null

  const row = await prisma.overtimeRequest.findUnique({
    where: { id: overtimeId },
    select: { overtimeBaseSnapshot: true },
  })
  if (!row) return null
  return parseSnapshot(row.overtimeBaseSnapshot)
}
