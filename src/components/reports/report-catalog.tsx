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

  if (!active) return null

  const totalFound = groups.reduce((sum, group) => sum + group.reports.length, 0)

  return (
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
          <h2 id="katalog-laporan" className="text-xl font-medium text-muted-foreground">
            {needle ? `Hasil untuk “${query.trim()}”` : active.label}
          </h2>
          <div role="search" className="w-full sm:w-[280px]">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari…"
              aria-label="Cari laporan di seluruh kategori"
            />
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
  )
}
