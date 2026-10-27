export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { CanCreate } from "@/components/auth/can-create"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { AppSearchField } from "@/components/ui/search-field"
import { WarrantyClaimList } from "./_components/warranty-claim-list"
import { getWarrantyExpiryQueue } from "@/lib/reports/warranty-expiry-queue-data"
import { WARRANTY_EXPIRY_WINDOW_CHOICES } from "@/lib/reports/warranty-expiry-queue"
import { WarrantyExpiryQueueCard } from "@/components/reports/warranty-expiry-queue-card"
import { getWarrantyIntakeQueue } from "@/lib/reports/warranty-claim-intake-queue-data"
import { WarrantyIntakeQueueCard } from "@/components/reports/warranty-intake-queue-card"

export const metadata: Metadata = { title: "Klaim Garansi" }

const STATUS_FILTERS = [
  { value: "", label: "Semua Status" },
  { value: "intake", label: "Masuk" },
  { value: "eligibility", label: "Penilaian" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
  { value: "in_repair", label: "Dalam Perbaikan" },
  { value: "closed", label: "Tutup" },
]

/**
 * Daftar klaim garansi (F-2026-10-21-021 tahap UI).
 *
 * Halaman hanya MEMBACA klaim + cakupan apa adanya dari database lewat
 * Prisma boundary server; tidak ada penilaian eligibility dan tidak ada
 * keputusan di sini. Detail klaim (fakta penilaian + keputusan pejabat)
 * hidup di halaman [claimSlug]; intake baru di /produksi/garansi/tambah.
 */
export default async function WarrantyClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string; jendelaDepan?: string; jendelaLampau?: string }>
}) {
  await requirePermission("view_warranty_claims")
  const params = await searchParams
  const status = params.status ?? ""
  const cari = (params.cari ?? "").trim()
  const windowAheadDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(params.jendelaDepan),
  )
    ? Number(params.jendelaDepan)
    : undefined
  const windowPastDays = (WARRANTY_EXPIRY_WINDOW_CHOICES as readonly number[]).includes(
    Number(params.jendelaLampau),
  )
    ? Number(params.jendelaLampau)
    : undefined
  const expiryQueue = await getWarrantyExpiryQueue("claims_page", {
    windowAheadDays,
    windowPastDays,
  })
  const intakeQueue = await getWarrantyIntakeQueue()

  const claims = await prisma.warrantyClaim.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(cari
        ? {
            OR: [
              { complaint: { contains: cari } },
              { customerVehicle: { plateNumber: { contains: cari } } },
              { coverage: { item: { name: { contains: cari } } } },
            ],
          }
        : {}),
    },
    orderBy: { reportedAt: "desc" },
    take: 200,
    include: {
      customerVehicle: { select: { plateNumber: true } },
      coverage: {
        select: {
          status: true,
          expiresAt: true,
          item: { select: { name: true } },
        },
      },
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Klaim Garansi" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Klaim Garansi</h1>
        <CanCreate permission="create_warranty_claims">
          <Link
            href="/produksi/garansi/tambah"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
          >
            Buat Klaim Garansi
          </Link>
        </CanCreate>
      </div>

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter klaim garansi">
      <form
        method="get"
        aria-label="Filter status klaim garansi"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="warranty-status-filter" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Status
          </label>
          <select
            id="warranty-status-filter"
            name="status"
            defaultValue={status}
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="cari" defaultValue={cari} />
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
        >
          Terapkan
        </button>
      </form>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cari</span>
          <AppSearchField action="/produksi/garansi" placeholder="Keluhan, plat nomor, atau barang" />
        </div>
      </div>

      <form
        method="get"
        aria-label="Filter jendela garansi segera berakhir"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="warranty-window-ahead" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Jendela ke depan (hari)
          </label>
          <select
            id="warranty-window-ahead"
            name="jendelaDepan"
            defaultValue={String(expiryQueue.windowAheadDays)}
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="warranty-window-past" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Jendela lampau (hari)
          </label>
          <select
            id="warranty-window-past"
            name="jendelaLampau"
            defaultValue={String(expiryQueue.windowPastDays)}
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm text-foreground"
          >
            {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:-translate-y-px hover:shadow-md"
        >
          Terapkan Jendela
        </button>
      </form>

      <WarrantyIntakeQueueCard queue={intakeQueue} />

      <WarrantyExpiryQueueCard queue={expiryQueue} />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <WarrantyClaimList claims={claims} />
      </div>

      <p className="text-sm text-muted-foreground">
        Menampilkan {claims.length} klaim terbaru. Fakta penilaian dan keputusan pejabat ada di halaman detail klaim.
      </p>
    </div>
  )
}
