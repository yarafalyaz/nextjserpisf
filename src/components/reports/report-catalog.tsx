"use client"

import Link from "next/link"
import { useMemo, useState, type ReactNode } from "react"

import { Input } from "@/components/ui/shadcn/input"

export interface ReportCatalogEntry {
  href: string
  label: string
  /** Satu baris penjelasan, gaya "Menampilkan …". */
  desc: string
  /** Ikon yang sudah dirender di server — elemen React, bukan komponen. */
  icon: ReactNode
}

export interface ReportCatalogCategory {
  key: string
  label: string
  icon: ReactNode
  reports: ReportCatalogEntry[]
}

/**
 * Katalog laporan bergaya daftar laporan Accurate: kategori di kiri, kotak
 * "Cari…" di kanan atas, lalu laporan dalam dua kolom — masing-masing dengan
 * ikon, judul, dan satu baris penjelasan.
 *
 * Dua perilaku yang disengaja:
 *
 * - **Cari menyisir SEMUA kategori**, bukan hanya yang sedang dibuka. Dengan 34
 *   laporan lintas 8 kategori, mencari "piutang" sambil membuka kategori
 *   Keuangan tidak boleh menghasilkan nol — hasilnya dikelompokkan per kategori
 *   supaya tetap jelas laporan itu milik mana.
 * - **Tanpa kata kunci**, yang tampil hanya kategori aktif, jadi daftarnya
 *   sepanjang halaman seperti di Accurate.
 *
 * Penyaringan dilakukan di klien: seluruh katalog hanya 34 baris dan datanya
 * sudah ikut terkirim, jadi tidak perlu perjalanan ke server (berbeda dari
 * filter laporan yang mengubah periode dan memang harus jadi alamat yang bisa
 * dibagikan).
 */
// 6 Laporan Keuangan Utama Standar ERP Internasional (PSAK / IFRS) untuk akses cepat
const CORE_REPORT_HREFS = [
  "/laporan/laba-rugi",
  "/laporan/neraca",
  "/laporan/arus-kas",
  "/laporan/buku-besar",
  "/laporan/neraca-saldo",
  "/laporan/piutang-jatuh-tempo",
]

export function ReportCatalog({ categories }: { categories: ReportCatalogCategory[] }) {
  const [activeKey, setActiveKey] = useState(categories[0]?.key ?? "")
  const [query, setQuery] = useState("")

  const active = categories.find((category) => category.key === activeKey) ?? categories[0]
  const needle = query.trim().toLowerCase()

  const groups = useMemo(() => {
    if (!active) return []
    const matches = (report: ReportCatalogEntry) =>
      `${report.label} ${report.desc}`.toLowerCase().includes(needle)

    if (!needle) return [{ key: active.key, label: active.label, reports: active.reports }]

    return categories
      .map((category) => ({
        key: category.key,
        label: category.label,
        reports: category.reports.filter(matches),
      }))
      .filter((group) => group.reports.length > 0)
  }, [active, categories, needle])

  const allReportsMap = useMemo(() => {
    const map = new Map<string, ReportCatalogEntry>()
    for (const c of categories) {
      for (const r of c.reports) {
        map.set(r.href, r)
      }
    }
    return map
  }, [categories])

  const coreReports = useMemo(() => {
    return CORE_REPORT_HREFS.map((href) => allReportsMap.get(href)).filter(
      (r): r is ReportCatalogEntry => Boolean(r),
    )
  }, [allReportsMap])

  if (!active) return null

  const totalFound = groups.reduce((sum, group) => sum + group.reports.length, 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Akses Cepat Laporan Keuangan Utama */}
      {!needle && coreReports.length > 0 && (
        <section aria-label="Laporan Keuangan Utama" className="rounded-xl border border-default bg-surface p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Laporan Keuangan Utama (Standar PSAK / IFRS)
            </h2>
            <span className="text-xs text-muted-foreground">Akses Cepat</span>
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {coreReports.map((report) => (
              <Link
                key={`pinned-${report.href}`}
                href={report.href}
                className="group flex flex-col items-center text-center p-3 rounded-lg border border-default bg-background/50 hover:bg-primary/5 hover:border-primary/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2 group-hover:scale-105 transition-colors">
                  {report.icon}
                </span>
                <span className="text-xs font-semibold text-foreground line-clamp-1">{report.label}</span>
                <span className="text-[0.6875rem] text-muted-foreground line-clamp-1 mt-0.5">{report.desc.replace(/^Menampilkan\s+/, "")}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
      <nav aria-label="Kategori laporan" className="lg:w-[260px] lg:shrink-0">
        <ul className="flex flex-wrap gap-1.5 lg:flex-col">
          {categories.map((category) => {
            const isActive = category.key === active.key
            return (
              <li key={category.key}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => {
                    setActiveKey(category.key)
                    setQuery("")
                  }}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors " +
                    (isActive
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-foreground hover:bg-muted")
                  }
                >
                  <span aria-hidden="true" className="flex shrink-0 items-center">
                    {category.icon}
                  </span>
                  <span className="truncate">{category.label}</span>
                  <span
                    className={
                      "ml-auto shrink-0 text-xs " + (isActive ? "opacity-80" : "text-muted-foreground")
                    }
                  >
                    {category.reports.length}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <section className="min-w-0 flex-1 rounded-xl border border-default bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 id="katalog-laporan" className="text-xl font-medium text-muted-foreground">
              {needle ? `Hasil untuk “${query.trim()}”` : active.label}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium text-muted-foreground">
              {needle ? `${totalFound} ditemukan` : `${active.reports.length} laporan`}
            </span>
          </div>
          <div role="search" className="flex items-center gap-2 w-full sm:w-[280px]">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari laporan..."
              aria-label="Cari laporan di seluruh kategori"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-muted-foreground hover:text-foreground shrink-0 underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {totalFound === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Tidak ada laporan yang cocok dengan “{query.trim()}”. Coba kata lain seperti
            “piutang”, “stok”, atau “pajak”.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {groups.map((group) => (
              <div key={group.key}>
                {needle ? (
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.label} ({group.reports.length})
                  </h3>
                ) : null}
                <ul
                  aria-labelledby="katalog-laporan"
                  className="grid gap-1.5 sm:grid-cols-2"
                >
                  {group.reports.map((report) => (
                    <li key={report.href}>
                      <Link
                        href={report.href}
                        title={`${report.label} - ${report.desc}`}
                        className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                        >
                          {report.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-foreground">
                            {report.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {report.desc}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  )
}
