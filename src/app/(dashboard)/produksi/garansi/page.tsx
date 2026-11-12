export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { CanCreate } from "@/components/auth/can-create"
import { PageHeader } from "@/components/ui/page-header"
import { AppSearchField } from "@/components/ui/search-field"
import { WarrantyClaimList } from "./_components/warranty-claim-list"
import { getWarrantyExpiryQueue } from "@/lib/reports/warranty-expiry-queue-data"
import { WARRANTY_EXPIRY_WINDOW_CHOICES } from "@/lib/reports/warranty-expiry-queue"
import { WarrantyExpiryQueueCard } from "@/components/reports/warranty-expiry-queue-card"
import { getWarrantyIntakeQueue } from "@/lib/reports/warranty-claim-intake-queue-data"
import { WarrantyIntakeQueueCard } from "@/components/reports/warranty-intake-queue-card"
import {
  ShieldAlert,
  Plus,
  Package,
  Wrench,
  CheckCircle2,
  Clock,
  Filter,
  Calendar,
} from "@/components/ui/fontawesome-icons"
import { formatNumber } from "@/lib/utils/format"

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

  const [expiryQueue, intakeQueue, claims, countsByStatus] = await Promise.all([
    getWarrantyExpiryQueue("claims_page", {
      windowAheadDays,
      windowPastDays,
    }),
    getWarrantyIntakeQueue(),
    prisma.warrantyClaim.findMany({
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
    }),
    prisma.warrantyClaim.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ])

  const statusCountMap = countsByStatus.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.status] = curr._count._all
    return acc
  }, {})
  const totalClaimsCount = countsByStatus.reduce((acc, curr) => acc + curr._count._all, 0)
  const intakeCount = statusCountMap["intake"] ?? 0
  const activeRepairCount = (statusCountMap["in_repair"] ?? 0) + (statusCountMap["approved"] ?? 0)
  const closedCount = statusCountMap["closed"] ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Klaim Garansi"
        subtitle="Registrasi klaim garansi purnajual, monitoring antrean intake, dan masa berlaku garansi kendaraan"
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Klaim Garansi" },
        ]}
        actions={
          <CanCreate permission="create_warranty_claims">
            <Link
              href="/produksi/garansi/tambah"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Buat Klaim Garansi</span>
            </Link>
          </CanCreate>
        }
      />

      {/* ERP Unified Metric Strip (Non-Floating Linear Standard) */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan status klaim garansi"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Klaim</span>
            <ShieldAlert className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalClaimsCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh pengajuan pelanggan</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Klaim Masuk</span>
            <Package className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(intakeCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Antrean butuh verifikasi</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Perbaikan Aktif</span>
            <Wrench className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(activeRepairCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Disetujui / dalam bengkel</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Selesai / Tutup</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(closedCount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Klaim terselesaikan</p>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-default bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filter Klaim & Pencarian
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter klaim garansi">
            <form
              method="get"
              aria-label="Filter status klaim garansi"
              className="flex flex-wrap items-end gap-2"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="warranty-status-filter"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Status Klaim
                </label>
                <div className="relative">
                  <select
                    id="warranty-status-filter"
                    name="status"
                    defaultValue={status}
                    className="min-h-11 rounded-lg border border-default bg-surface px-3 py-2 pr-8 text-sm text-foreground shadow-xs transition-colors hover:border-primary/50 focus:border-primary focus:outline-hidden"
                  >
                    {STATUS_FILTERS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <input type="hidden" name="cari" defaultValue={cari} />
              {params.jendelaDepan ? (
                <input type="hidden" name="jendelaDepan" defaultValue={params.jendelaDepan} />
              ) : null}
              {params.jendelaLampau ? (
                <input type="hidden" name="jendelaLampau" defaultValue={params.jendelaLampau} />
              ) : null}
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition-all hover:bg-muted/50 hover:shadow-xs active:scale-[0.99]"
              >
                Terapkan Status
              </button>
            </form>

            <div className="flex flex-col gap-1.5 min-w-[240px] flex-1 sm:flex-initial">
              <span className="text-xs font-medium text-muted-foreground">Pencarian</span>
              <AppSearchField
                action="/produksi/garansi"
                placeholder="Keluhan, plat nomor, atau barang..."
              />
            </div>
          </div>

          {/* Expiry Window Filter Form */}
          <form
            method="get"
            aria-label="Filter jendela garansi segera berakhir"
            className="flex flex-wrap items-end gap-2 border-t border-border/50 pt-3 lg:border-t-0 lg:pt-0"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="warranty-window-ahead"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span>Depan (hari)</span>
              </label>
              <select
                id="warranty-window-ahead"
                name="jendelaDepan"
                defaultValue={String(expiryQueue.windowAheadDays)}
                className="min-h-11 rounded-lg border border-default bg-surface px-3 py-2 text-sm font-mono tabular-nums text-foreground shadow-xs transition-colors hover:border-primary/50 focus:border-primary focus:outline-hidden"
              >
                {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d} hari
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="warranty-window-past"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              >
                <Calendar className="h-3 w-3" aria-hidden="true" />
                <span>Lampau (hari)</span>
              </label>
              <select
                id="warranty-window-past"
                name="jendelaLampau"
                defaultValue={String(expiryQueue.windowPastDays)}
                className="min-h-11 rounded-lg border border-default bg-surface px-3 py-2 text-sm font-mono tabular-nums text-foreground shadow-xs transition-colors hover:border-primary/50 focus:border-primary focus:outline-hidden"
              >
                {WARRANTY_EXPIRY_WINDOW_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d} hari
                  </option>
                ))}
              </select>
            </div>

            {status ? <input type="hidden" name="status" defaultValue={status} /> : null}
            {cari ? <input type="hidden" name="cari" defaultValue={cari} /> : null}

            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-default bg-surface px-4 py-2 text-xs font-semibold text-foreground shadow-xs transition-all hover:bg-muted/50 hover:shadow-xs active:scale-[0.99]"
            >
              Terapkan Jendela
            </button>
          </form>
        </div>
      </div>

      <WarrantyIntakeQueueCard queue={intakeQueue} />

      <WarrantyExpiryQueueCard queue={expiryQueue} />

      <div className="overflow-hidden rounded-xl border border-default bg-surface shadow-sm">
        <WarrantyClaimList claims={claims} />
      </div>

      <p className="text-xs text-muted-foreground">
        Menampilkan <span className="font-mono tabular-nums font-semibold">{claims.length}</span> klaim terbaru. Fakta penilaian dan keputusan pejabat ada di halaman detail klaim.
      </p>
    </div>
  )
}
