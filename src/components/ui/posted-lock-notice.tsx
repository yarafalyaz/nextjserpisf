import Link from "next/link"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * GL-BR-003 K1/K2 (AC-GL-005): dokumen posted/final immutable.
 * Tombol Ubah/Hapus hanya untuk draf; panel ini tampil sebagai gantinya
 * pada dokumen non-draf: judul + alasan + tautan jalur koreksi sah (K2).
 * UI murni presentasional — penegakan tetap di server action (fail-closed).
 * Sengaja tidak memakai Alert shadcn: Alert memaksa role="alert" sedangkan
 * panel ini status netral (role="note" + aria-label Indonesia).
 */
export function PostedLockNotice({
  documentLabel,
  correctionHref,
  correctionLabel,
  className,
}: {
  documentLabel: string
  correctionHref?: string
  correctionLabel?: string
  className?: string
}) {
  const correction = correctionLabel ?? "dokumen koreksi"
  return (
    <div
      role="note"
      aria-label={`${documentLabel} terkunci`}
      className={cn(
        "relative w-full rounded-lg border px-4 py-3 text-sm",
        "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium tracking-tight">
            {documentLabel} terkunci — sudah posted
          </p>
          <p className="opacity-90">
            Dokumen posted tidak bisa diubah atau dihapus. Koreksi hanya lewat{" "}
            {correctionHref ? (
              <Link
                href={correctionHref}
                className="font-medium underline underline-offset-4"
              >
                {correction}
              </Link>
            ) : (
              correction
            )}{" "}
            agar jejak audit utuh.
          </p>
        </div>
      </div>
    </div>
  )
}
