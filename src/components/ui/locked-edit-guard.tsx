import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PostedLockNotice } from "@/components/ui/posted-lock-notice"

/**
 * GL-BR-003 K1 (AC-GL-005): halaman ubah dokumen terkunci.
 * Cermin guard server fail-closed — tampilkan notice + tautan kembali,
 * bukan form yang pasti ditolak server.
 *
 * Varian `preset` menampung pola guard berulang antar halaman ubah sales
 * (faktur/penawaran/pesanan/pembayaran): crumb "Dasbor > Penjualan >
 * {section} > Ubah", label dokumen + koreksi + tautan kembali baku —
 * pemanggil cukup isi `slug`/`documentNo`. Bebas `preset` = mode lama
 * (crumbs/dokumen/koreksi/back eksplisit per halaman).
 */
export function LockedEditGuard({
  crumbs,
  documentLabel,
  correctionHref,
  correctionLabel,
  backHref,
  backLabel,
  preset,
}: {
  crumbs?: Array<{ label: string; href?: string }>
  documentLabel?: string
  correctionHref?: string
  correctionLabel?: string
  backHref?: string
  backLabel?: string
  preset?: {
    section: string
    sectionHref: string
    documentKind: string
    documentNo: string | null
    slug: string | number
    correctionHref?: string
    correctionLabel?: string
    backHref?: string
    backLabel?: string
  }
}) {
  const resolved = preset
    ? {
        crumbs: [
          { label: "Dasbor", href: "/" },
          { label: "Penjualan", href: "/penjualan" },
          { label: preset.section, href: preset.sectionHref },
          { label: "Ubah" },
        ],
        documentLabel: `${preset.documentKind} ${preset.documentNo ?? "tanpa nomor"}`,
        correctionHref: preset.correctionHref,
        correctionLabel: preset.correctionLabel,
        backHref: preset.backHref ?? `${preset.sectionHref}/${preset.slug}`,
        backLabel: preset.backLabel ?? `Kembali ke detail ${preset.documentKind.toLowerCase()}`,
      }
    : {
        crumbs: crumbs ?? [],
        documentLabel: documentLabel ?? "",
        correctionHref,
        correctionLabel,
        backHref: backHref ?? "",
        backLabel: backLabel ?? "",
      }
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={resolved.crumbs} />
      <PostedLockNotice
        documentLabel={resolved.documentLabel}
        correctionHref={resolved.correctionHref}
        correctionLabel={resolved.correctionLabel}
      />
      <Link
        href={resolved.backHref}
        className="text-sm font-medium underline underline-offset-4"
      >
        {resolved.backLabel}
      </Link>
    </div>
  )
}
