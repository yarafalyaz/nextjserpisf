import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PostedLockNotice } from "@/components/ui/posted-lock-notice"

/**
 * GL-BR-003 K1 (AC-GL-005): halaman ubah dokumen terkunci.
 * Cermin guard server fail-closed — tampilkan notice + tautan kembali,
 * bukan form yang pasti ditolak server.
 */
export function LockedEditGuard({
  crumbs,
  documentLabel,
  correctionHref,
  correctionLabel,
  backHref,
  backLabel,
}: {
  crumbs: Array<{ label: string; href?: string }>
  documentLabel: string
  correctionHref?: string
  correctionLabel?: string
  backHref: string
  backLabel: string
}) {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={crumbs} />
      <PostedLockNotice
        documentLabel={documentLabel}
        correctionHref={correctionHref}
        correctionLabel={correctionLabel}
      />
      <Link
        href={backHref}
        className="text-sm font-medium underline underline-offset-4"
      >
        {backLabel}
      </Link>
    </div>
  )
}
