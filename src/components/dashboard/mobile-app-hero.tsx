import Link from "next/link"
import {
  CalendarDays,
  ChevronRight,
  FilePlus,
  Plus,
  ScanBarcode,
  TrendingUp,
} from "@/components/ui/fontawesome-icons"

interface MobileAppHeroProps {
  shortDate: string
  totalRevenue: string
  receivables: string
  activeProjects: number
  completedThisMonth: number
  overdueProjects: number
  totalCustomers: number
  showFinancials: boolean
  showCustomers: boolean
  canViewReports: boolean
  canCreateInvoices: boolean
  canCreateProjects: boolean
}

export function MobileAppHero({
  shortDate,
  totalRevenue,
  receivables,
  activeProjects,
  completedThisMonth,
  overdueProjects,
  totalCustomers,
  showFinancials,
  showCustomers,
  canViewReports,
  canCreateInvoices,
  canCreateProjects,
}: MobileAppHeroProps) {
  const tiles = [
    canCreateProjects
      ? {
          href: "/proyek/tambah",
          label: "Proyek",
          icon: Plus,
          primary: true,
        }
      : {
          href: "/proyek",
          label: "Proyek",
          icon: Plus,
          primary: true,
        },
    canCreateInvoices
      ? {
          href: "/penjualan/faktur/tambah",
          label: "Faktur",
          icon: FilePlus,
          primary: false,
        }
      : {
          href: "/penjualan/faktur",
          label: "Faktur",
          icon: FilePlus,
          primary: false,
        },
    {
      href: "/inventaris/scan",
      label: "Scan",
      icon: ScanBarcode,
      primary: false,
    },
    canViewReports
      ? {
          href: "/laporan/laba-rugi",
          label: "Laporan",
          icon: TrendingUp,
          primary: false,
        }
      : {
          href: "/kalender",
          label: "Kalender",
          icon: CalendarDays,
          primary: false,
        },
  ]

  return (
    <section aria-label="Ringkasan aplikasi mobile" className="flex flex-col gap-3 px-4 md:hidden">
      {/* Compact App Context Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Dasbor Operasional
        </h1>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {shortDate}
        </span>
      </div>

      {/* Executive Summary Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
        {showFinancials ? (
          <>
            <Link
              href="/penjualan/pembayaran"
              className="flex items-center justify-between gap-3 rounded-lg active:opacity-75 transition-opacity"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Total Pendapatan (Kas Masuk)
                  </span>
                </div>
                <p className="mt-1 truncate text-2xl font-bold tracking-tight tabular-nums text-foreground">
                  {totalRevenue}
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </span>
            </Link>

            <div className="mt-3.5 grid grid-cols-2 divide-x divide-border border-t border-border/60 pt-3">
              <Link
                href="/laporan/piutang-pelanggan"
                className="flex min-w-0 flex-col gap-0.5 pr-3 active:opacity-75 transition-opacity"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                  Piutang Berjalan
                </span>
                <span className="truncate text-sm font-semibold tabular-nums text-foreground">
                  {receivables}
                </span>
              </Link>

              <Link
                href="/proyek"
                className="flex min-w-0 flex-col gap-0.5 pl-3 active:opacity-75 transition-opacity"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                  Mobil di Bengkel
                </span>
                <div className="flex items-baseline gap-1.5 truncate">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {activeProjects} unit
                  </span>
                  {overdueProjects > 0 ? (
                    <span className="text-[11px] font-medium tabular-nums text-red-600 dark:text-red-400">
                      ({overdueProjects} lewat)
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      ({completedThisMonth} selesai)
                    </span>
                  )}
                </div>
              </Link>
            </div>
          </>
        ) : (
          <Link
            href="/proyek"
            className="flex items-center justify-between gap-3 active:opacity-75 transition-opacity"
          >
            <div>
              <span className="text-xs font-medium text-muted-foreground">
                Mobil di Bengkel
              </span>
              <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {activeProjects} unit
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {completedThisMonth} selesai bulan ini
                {showCustomers ? ` · ${totalCustomers} pelanggan` : ""}
              </p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* 4-Tile App Launcher */}
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card p-2 text-center shadow-2xs transition-transform duration-100 active:scale-95"
            >
              <span
                className={
                  tile.primary
                    ? "flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
                    : "flex size-8 items-center justify-center rounded-lg bg-muted text-foreground"
                }
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-medium leading-none text-foreground">
                {tile.label}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
