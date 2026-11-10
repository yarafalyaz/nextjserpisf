import Link from "next/link"
import { ArrowUpRight } from "@/components/ui/fontawesome-icons"

interface SectionCardsProps {
  totalRevenue: string
  activeProjects: number
  completedThisMonth: number
  overdueProjects: number
  receivables: string
  totalCustomers: number
}

export function SectionCards({
  totalRevenue,
  activeProjects,
  completedThisMonth,
  overdueProjects,
  receivables,
  totalCustomers,
}: SectionCardsProps) {
  return (
    <section aria-label="Ringkasan kinerja" className="px-4 lg:px-6">
      <dl className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-2 sm:divide-x sm:divide-y-0 @5xl/main:grid-cols-4">
        {/* Metric 1: Total Pendapatan */}
        <div className="flex min-w-0 flex-col justify-between gap-3 p-4 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs font-medium text-muted-foreground">
              Total Pendapatan
            </dt>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/80 bg-emerald-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
              <span
                className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
                aria-hidden="true"
              />
              Kas Masuk
            </span>
          </div>

          <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums @[250px]/main:text-[26px]">
            {totalRevenue}
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <span className="truncate text-muted-foreground">
              Faktur lunas &amp; sebagian
            </span>
            <Link
              href="/penjualan/pembayaran"
              className="group inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              Riwayat pembayaran
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* Metric 2: Mobil Dikerjakan */}
        <div className="flex min-w-0 flex-col justify-between gap-3 p-4 sm:border-t-0 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs font-medium text-muted-foreground">
              Mobil Dikerjakan
            </dt>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-blue-800 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">
              <span
                className="size-1.5 rounded-full bg-blue-600 dark:bg-blue-400"
                aria-hidden="true"
              />
              WIP Bengkel
            </span>
          </div>

          <dd className="flex items-baseline gap-2">
            <span className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums @[250px]/main:text-[26px]">
              {activeProjects}
            </span>
            <span className="text-xs text-muted-foreground">unit di lantai</span>
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <span className="truncate text-muted-foreground">
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
              className="group inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              Daftar proyek
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* Metric 3: Piutang Berjalan */}
        <div className="flex min-w-0 flex-col justify-between gap-3 p-4 sm:border-t @5xl/main:border-t-0 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs font-medium text-muted-foreground">
              Piutang Berjalan
            </dt>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200/80 bg-amber-50 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              <span
                className="size-1.5 rounded-full bg-amber-600 dark:bg-amber-400"
                aria-hidden="true"
              />
              Belum Tertagih
            </span>
          </div>

          <dd className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums @[250px]/main:text-[26px]">
            {receivables}
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <span className="truncate text-muted-foreground">
              Tagihan dikurangi retur
            </span>
            <Link
              href="/laporan/piutang-pelanggan"
              className="group inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              Umur piutang
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        {/* Metric 4: Pelanggan Aktif */}
        <div className="flex min-w-0 flex-col justify-between gap-3 p-4 sm:border-t @5xl/main:border-t-0 lg:p-5">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-xs font-medium text-muted-foreground">
              Pelanggan Aktif
            </dt>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap text-muted-foreground">
              Master Data
            </span>
          </div>

          <dd className="flex items-baseline gap-2">
            <span className="text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-foreground tabular-nums @[250px]/main:text-[26px]">
              {totalCustomers}
            </span>
            <span className="text-xs text-muted-foreground">entitas terdaftar</span>
          </dd>

          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
            <span className="truncate text-muted-foreground">
              Basis akun &amp; kendaraan
            </span>
            <Link
              href="/master/pelanggan"
              className="group inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              Data pelanggan
              <ArrowUpRight
                className="size-3 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </dl>
    </section>
  )
}
