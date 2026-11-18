import Link from "next/link"
import { ArrowUpRight } from "@/components/ui/fontawesome-icons"

interface SectionCardsProps {
  totalRevenue: string
  activeProjects: number
  completedThisMonth: number
  overdueProjects: number
  receivables: string
  totalCustomers: number
  showFinancials?: boolean
  showCustomers?: boolean
}

export function SectionCards({
  totalRevenue,
  activeProjects,
  completedThisMonth,
  overdueProjects,
  receivables,
  totalCustomers,
  showFinancials = true,
  showCustomers = true,
}: SectionCardsProps) {
  const visibleCount = (showFinancials ? 2 : 0) + 1 + (showCustomers ? 1 : 0)
  const gridColsClass =
    visibleCount >= 4
      ? "@5xl/main:grid-cols-4"
      : visibleCount === 3
        ? "@5xl/main:grid-cols-3"
        : visibleCount === 2
          ? "@5xl/main:grid-cols-2"
          : "@5xl/main:grid-cols-1"

  return (
    <section aria-label="Ringkasan kinerja" className="px-4 lg:px-6">
      <dl className={`grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs sm:divide-x sm:divide-y-0 ${gridColsClass}`}>
        {/* Metric 1: Total Pendapatan */}
        {showFinancials && (
        <div className="flex min-w-0 flex-col justify-between gap-2 sm:gap-3 border-b border-r border-border p-3 sm:border-b-0 sm:border-r-0 sm:p-4 lg:p-5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <dt className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-600 sm:hidden dark:bg-emerald-400" aria-hidden="true" />
              <span className="truncate">Total Pendapatan</span>
            </dt>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span
                className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                aria-hidden="true"
              />
              Kas Masuk
            </span>
          </div>

          <dd className="text-[15px] sm:text-2xl lg:text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate">
            {totalRevenue}
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] sm:pt-2.5 sm:text-xs">
            <span className="hidden truncate text-muted-foreground sm:inline">
              Faktur lunas &amp; sebagian
            </span>
            <Link
              href="/penjualan/pembayaran"
              className="group inline-flex min-h-11 shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline md:min-h-0"
            >
              <span className="sm:hidden">Riwayat</span>
              <span className="hidden sm:inline">Riwayat pembayaran</span>
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-colors duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
        )}

        {/* Metric 2: Mobil Dikerjakan */}
        <div className="flex min-w-0 flex-col justify-between gap-2 sm:gap-3 border-b border-border p-3 sm:border-b-0 sm:p-4 lg:p-5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <dt className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-blue-600 sm:hidden dark:bg-blue-400" aria-hidden="true" />
              <span className="truncate">Mobil Dikerjakan</span>
            </dt>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">
              <span
                className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400"
                aria-hidden="true"
              />
              WIP Bengkel
            </span>
          </div>

          <dd className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-[15px] sm:text-2xl lg:text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
              {activeProjects}
            </span>
            <span className="text-[11px] sm:text-xs text-muted-foreground truncate">unit di lantai</span>
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] sm:pt-2.5 sm:text-xs">
            <span className="hidden truncate text-muted-foreground sm:inline">
              Selesai bulan ini:{" "}
              <strong className="font-semibold text-foreground tabular-nums">
                {completedThisMonth}
              </strong>
              {overdueProjects > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-red-600 tabular-nums dark:text-red-400">
                    {overdueProjects} lewat target
                  </span>
                </>
              )}
            </span>
            <Link
              href="/proyek"
              className="group inline-flex min-h-11 shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline md:min-h-0"
            >
              <span className="sm:hidden">Proyek ({completedThisMonth} selesai)</span>
              <span className="hidden sm:inline">Daftar proyek</span>
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-colors duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* Metric 3: Piutang Berjalan */}
        {showFinancials && (
        <div className="flex min-w-0 flex-col justify-between gap-2 sm:gap-3 border-r border-border p-3 sm:border-r-0 sm:border-t @5xl/main:border-t-0 sm:p-4 lg:p-5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <dt className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-amber-600 sm:hidden dark:bg-amber-400" aria-hidden="true" />
              <span className="truncate">Piutang Berjalan</span>
            </dt>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              <span
                className="size-1.5 rounded-full bg-amber-600 dark:bg-amber-400"
                aria-hidden="true"
              />
              Belum Tertagih
            </span>
          </div>

          <dd className="text-[15px] sm:text-2xl lg:text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate">
            {receivables}
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] sm:pt-2.5 sm:text-xs">
            <span className="hidden truncate text-muted-foreground sm:inline">
              Tagihan dikurangi retur
            </span>
            <Link
              href="/laporan/piutang-pelanggan"
              className="group inline-flex min-h-11 shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline md:min-h-0"
            >
              Umur piutang
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-colors duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
        )}

        {/* Metric 4: Pelanggan Aktif */}
        {showCustomers && (
        <div className="flex min-w-0 flex-col justify-between gap-2 sm:gap-3 p-3 sm:border-t @5xl/main:border-t-0 sm:p-4 lg:p-5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            <dt className="flex min-w-0 items-center gap-1.5 text-[11px] sm:text-xs font-medium text-muted-foreground">
              <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60 sm:hidden" aria-hidden="true" />
              <span className="truncate">Pelanggan Aktif</span>
            </dt>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-muted-foreground">
              Master Data
            </span>
          </div>

          <dd className="flex items-baseline gap-1.5 sm:gap-2">
            <span className="text-[15px] sm:text-2xl lg:text-[26px] leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
              {totalCustomers}
            </span>
            <span className="text-[11px] sm:text-xs text-muted-foreground truncate">entitas</span>
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] sm:pt-2.5 sm:text-xs">
            <span className="hidden truncate text-muted-foreground sm:inline">
              Basis akun &amp; kendaraan
            </span>
            <Link
              href="/master/pelanggan"
              className="group inline-flex min-h-11 shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline md:min-h-0"
            >
              <span className="sm:hidden">Pelanggan</span>
              <span className="hidden sm:inline">Data pelanggan</span>
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-colors duration-150 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
        )}
      </dl>
    </section>
  )
}
