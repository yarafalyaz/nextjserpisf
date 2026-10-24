import Link from "next/link"
import { TriangleAlert } from "lucide-react"

/**
 * F-2026-10-22-063-S (induk F-2026-10-21-023): lencana PERINGATAN fitment
 * per baris Quotation/WO. Snapshot `fitmentResult`/`fitmentRuleId` ditulis
 * server saat baris disimpan (PR #508) — komponen ini murni presentasi:
 * tidak mengevaluasi ulang, tidak ada tombol cek manual, tidak memblokir
 * dokumen (dokumen tetap sah apa pun lencananya).
 *
 * Aturan tampil persis §4 spec:
 * - "incompatible" → peringatan keras + tautan aturan pemenang (bila ada).
 * - "unknown" → lencana netral.
 * - "compatible" / null (tanpa kendaraan, tanpa itemId, belum dievaluasi)
 *   → tanpa lencana.
 */
export function FitmentBadge({
  fitmentResult,
  fitmentRuleId,
}: Readonly<{
  fitmentResult: string | null | undefined
  fitmentRuleId: number | null | undefined
}>) {
  if (fitmentResult === "incompatible") {
    return (
      <span className="mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
          <TriangleAlert size={12} aria-hidden="true" />
          Tidak cocok untuk kendaraan ini
        </span>
        {fitmentRuleId != null ? (
          <Link
            href={`/kendaraan/fitment/${fitmentRuleId}`}
            className="text-xs text-primary hover:underline"
          >
            Lihat aturan fitment
          </Link>
        ) : null}
      </span>
    )
  }
  if (fitmentResult === "unknown") {
    return (
      <span className="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Belum ada aturan fitment
      </span>
    )
  }
  return null
}

/**
 * Ringkasan hitungan baris incompatible per dokumen. Jumlah dihitung
 * pemanggil dari snapshot tersimpan (bukan evaluasi ulang); 0 → senyap.
 * Kata "dilarang/ditolak" dilarang spec — dokumen tetap sah.
 */
export function FitmentIncompatibleSummary({
  incompatibleCount,
}: Readonly<{ incompatibleCount: number }>) {
  if (incompatibleCount <= 0) return null
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        {incompatibleCount} baris tidak cocok untuk kendaraan ini. Periksa
        lencana pada tiap baris — dokumen tetap dapat dilanjutkan.
      </span>
    </p>
  )
}
