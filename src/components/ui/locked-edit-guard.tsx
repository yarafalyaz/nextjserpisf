import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { PostedLockNotice } from "@/components/ui/posted-lock-notice"

/**
 * GL-BR-003 K1 (AC-GL-005): halaman ubah dokumen terkunci.
 * Cermin guard server fail-closed — tampilkan notice + tautan kembali,
 * bukan form yang pasti ditolak server.
 *
 * Preset per tipe dokumen (crumbs/koreksi/back) di sini supaya 4 halaman
 * ubah + 4 halaman detail tidak menyalin blok props identik (dedup Sonar).
 */
type LockedDocKind = "faktur" | "penawaran" | "pesanan" | "pembayaran"

const LOCKED_PRESET: Record<
  LockedDocKind,
  {
    crumbs: Array<{ label: string; href?: string }>
    correctionLabel: string
    backHref: (ref: string) => string
    backLabel: string
  }
> = {
  faktur: {
    crumbs: [
      { label: "Dasbor", href: "/" },
      { label: "Penjualan", href: "/penjualan" },
      { label: "Faktur", href: "/penjualan/faktur" },
      { label: "Ubah" },
    ],
    correctionLabel: "retur penjualan",
    backHref: (ref) => `/penjualan/faktur/${ref}`,
    backLabel: "Kembali ke detail faktur",
  },
  penawaran: {
    crumbs: [
      { label: "Dasbor", href: "/" },
      { label: "Penjualan", href: "/penjualan" },
      { label: "Penawaran", href: "/penjualan/penawaran" },
      { label: "Ubah" },
    ],
    correctionLabel: "revisi/penawaran baru",
    backHref: (ref) => `/penjualan/penawaran/${ref}`,
    backLabel: "Kembali ke detail penawaran",
  },
  pesanan: {
    crumbs: [
      { label: "Dasbor", href: "/" },
      { label: "Penjualan", href: "/penjualan" },
      { label: "Pesanan Penjualan", href: "/penjualan/pesanan" },
      { label: "Ubah" },
    ],
    correctionLabel: "retur/void faktur turunan",
    backHref: (ref) => `/penjualan/pesanan/${ref}`,
    backLabel: "Kembali ke detail pesanan",
  },
  pembayaran: {
    crumbs: [
      { label: "Dasbor", href: "/" },
      { label: "Penjualan", href: "/penjualan" },
      { label: "Pembayaran", href: "/penjualan/pembayaran" },
      { label: "Ubah" },
    ],
    correctionLabel: "pembayaran pengganti baru",
    backHref: () => "/penjualan/pembayaran",
    backLabel: "Kembali ke daftar pembayaran",
  },
}

/** Breadcrumb + label koreksi + tautan kembali untuk satu tipe dokumen. */
export function lockedDocPreset(kind: LockedDocKind, ref: string) {
  const p = LOCKED_PRESET[kind]
  return {
    crumbs: p.crumbs,
    correctionLabel: p.correctionLabel,
    backHref: p.backHref(ref),
    backLabel: p.backLabel,
  }
}

/** Notice kunci posted untuk halaman detail (K2): 1 baris per tipe. */
export function LockedDocNotice({
  kind,
  documentNo,
  correctionHref,
}: {
  kind: LockedDocKind
  documentNo: string | null
  correctionHref?: string
}) {
  const docNames: Record<LockedDocKind, string> = {
    faktur: "Faktur",
    penawaran: "Penawaran",
    pesanan: "Pesanan Penjualan",
    pembayaran: "Pembayaran",
  }
  return (
    <PostedLockNotice
      documentLabel={`${docNames[kind]} ${documentNo ?? "-"}`}
      correctionHref={correctionHref}
      correctionLabel={LOCKED_PRESET[kind].correctionLabel}
    />
  )
}

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
