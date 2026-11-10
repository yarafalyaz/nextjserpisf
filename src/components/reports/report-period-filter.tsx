"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"
import { parseLocalDateOnly, toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { buildReportHref } from "@/lib/reports/report-href"

export interface ReportSelectFilter {
  /** Nama kunci di path, mis. "barang" / "gudang" / "akun". */
  param: string
  label: string
  placeholder: string
  /** Nilai yang sedang terpilih — kunci URL (slug, atau id untuk baris tanpa slug). */
  value: string
  options: { value: string; label: string }[]
  /** Tandai wajib supaya label diberi bintang (mis. Barang pada Kartu Stok). */
  required?: boolean
}

export interface ReportPeriodFilterProps {
  basePath: string
  /**
   * `as-of`: satu tanggal untuk laporan posisi (registry aset, neraca).
   * `range`: rentang untuk laporan pergerakan (mutasi aset, disposisi).
   * `month`: satu bulan (`defaultStartDate` berisi `YYYY-MM`).
   * `none`: laporan tanpa periode sama sekali (valuasi stok) — hanya filter.
   */
  mode?: "as-of" | "range" | "month" | "none"
  /** `YYYY-MM-DD` (`YYYY-MM` untuk mode `month`). */
  defaultStartDate: string
  /** `YYYY-MM-DD`; wajib untuk mode `range`. */
  defaultEndDate?: string
  /** Filter dropdown (pelanggan/vendor, gudang, akun, barang, …). */
  selects?: ReportSelectFilter[]
  /**
   * Satu tanggal tambahan di luar periode, mis. tanggal pembanding Neraca Saldo.
   * Kosong = tidak ikut ke alamat.
   */
  extraDate?: { param: string; label: string; value: string }
  /** Satu angka, mis. horizon bulan pada proyeksi kas. */
  numberField?: { param: string; label: string; value: string; min?: number; max?: number }
  /** Sakelar opsional. */
  toggle?: { param: string; label: string; checked: boolean }
  /**
   * Filter lain yang harus dipertahankan apa adanya — nilainya sudah berbentuk
   * kunci URL. Filter yang tidak dipakai cukup dihilangkan, jadi tidak ada
   * segmen kosong di alamat.
   */
  filters?: Record<string, string | undefined>
}

/**
 * Satu-satunya filter laporan di aplikasi ini.
 *
 * Seluruh parameter masuk ke SLUG url, bukan query string:
 *   /laporan/pajak/2026-10
 *   /laporan/mutasi-aset/2026-10
 *   /laporan/aset-tetap/2026-10-13
 *   /laporan/kartu-stok/2026-10/barang/busi-iridium/gudang/gudang-utama
 *
 * Alasannya: alamatnya tetap bisa dibagikan dan dibaca, dan filter yang tidak
 * dipakai cukup dihilangkan tanpa menyisakan segmen kosong.
 */
export function ReportPeriodFilter({
  basePath,
  mode = "as-of",
  defaultStartDate,
  defaultEndDate,
  selects,
  extraDate,
  numberField,
  toggle,
  filters,
}: ReportPeriodFilterProps) {
  const router = useRouter()
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate ?? defaultStartDate)
  const [toggled, setToggled] = useState(toggle?.checked ?? false)
  const [extraDateValue, setExtraDateValue] = useState(extraDate?.value ?? "")
  const [numberValue, setNumberValue] = useState(numberField?.value ?? "")
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries((selects ?? []).map((select) => [select.param, select.value])),
  )

  function handleGenerate() {
    // mode "none" = laporan tanpa periode; "month" memakai bulannya apa adanya.
    const slug =
      mode === "none"
        ? undefined
        : mode === "month"
          ? startDate
          : (() => {
              const start = parseLocalDateOnly(startDate)
              const end = mode === "range" ? parseLocalDateOnly(endDate) : start
              // Rentang terbalik dijepit ke tanggal awal agar tidak pernah
              // mengirim periode kosong (parseReportPeriod akan mengabaikannya).
              return buildReportPeriodSlug(start, end < start ? start : end)
            })()

    router.push(
      buildReportHref(basePath, slug, {
        ...selected,
        ...filters,
        ...(extraDate ? { [extraDate.param]: extraDateValue || undefined } : {}),
        ...(numberField ? { [numberField.param]: numberValue || undefined } : {}),
        ...(toggle ? { [toggle.param]: toggled ? "1" : undefined } : {}),
      }),
    )
    router.refresh()
  }

  function setPreset(start: Date, end: Date) {
    setStartDate(toLocalDateOnly(start))
    setEndDate(toLocalDateOnly(end))
  }

  function setAsOfPreset(date: Date) {
    setStartDate(toLocalDateOnly(date))
  }

  return (
    <div
      role="search"
      aria-label="Filter laporan"
      className="rounded-xl border border-default bg-surface p-4 flex flex-col gap-3 print:hidden"
    >
      {/* Tombol preset cepat (Bulan ini, Bulan lalu, Kuartal ini, Tahun ini / YTD) */}
      {mode === "range" || mode === "as-of" ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground/80 mr-1">Preset:</span>
          {mode === "range" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setPreset(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0))
                }}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setPreset(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0))
                }}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Bulan Lalu
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3
                  setPreset(new Date(now.getFullYear(), quarterStartMonth, 1), new Date(now.getFullYear(), quarterStartMonth + 3, 0))
                }}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Kuartal Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setPreset(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), now.getMonth() + 1, 0))
                }}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Tahun Ini (YTD)
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAsOfPreset(new Date())}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  setAsOfPreset(new Date(now.getFullYear(), now.getMonth(), 0))
                }}
                className="px-2.5 py-1 rounded-md border border-default hover:bg-surface-secondary hover:text-foreground transition-colors font-medium"
              >
                Akhir Bulan Lalu
              </button>
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
      {selects?.map((select) => (
        <div key={select.param} className="flex flex-col gap-1.5 w-full sm:w-[260px]">
          <label
            id={`filter-${select.param}-label`}
            htmlFor={`filter-${select.param}`}
            className="text-sm font-medium text-foreground"
          >
            {select.label}
            {select.required ? " *" : ""}
          </label>
          <Combobox
            id={`filter-${select.param}`}
            aria-labelledby={`filter-${select.param}-label`}
            options={select.options}
            value={selected[select.param] || null}
            onChange={(value) => setSelected((prev) => ({ ...prev, [select.param]: value || "" }))}
            placeholder={select.placeholder}
          />
        </div>
      ))}

      {mode === "range" ? (
        <>
          <AppDatePicker label="Dari" name="periodeMulai" value={startDate} onChange={setStartDate} className="w-full sm:w-[180px]" />
          <AppDatePicker label="s/d" name="periodeSelesai" value={endDate} onChange={setEndDate} className="w-full sm:w-[180px]" />
        </>
      ) : mode === "as-of" ? (
        <AppDatePicker label="Per tanggal" name="periode" value={startDate} onChange={setStartDate} className="w-full sm:w-[180px]" />
      ) : mode === "month" ? (
        <AppMonthPicker label="Bulan" name="periode" value={startDate} onChange={setStartDate} required className="w-full sm:w-[180px]" />
      ) : null}

      {numberField ? (
        <div className="flex flex-col gap-1.5 w-full sm:w-[140px]">
          <Label htmlFor={`filter-${numberField.param}`}>{numberField.label}</Label>
          <Input
            id={`filter-${numberField.param}`}
            type="number"
            min={numberField.min}
            max={numberField.max}
            value={numberValue}
            onChange={(event) => setNumberValue(event.target.value)}
            className="w-full sm:w-[140px]"
          />
        </div>
      ) : null}

      {extraDate ? (
        <AppDatePicker
          label={extraDate.label}
          name={extraDate.param}
          value={extraDateValue}
          onChange={setExtraDateValue}
          className="w-full sm:w-[220px]"
        />
      ) : null}

      {toggle ? (
        <label
          htmlFor={`opsi-${toggle.param}`}
          className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-foreground"
        >
          <Checkbox
            id={`opsi-${toggle.param}`}
            checked={toggled}
            onCheckedChange={(value) => setToggled(value === true)}
          />
          {toggle.label}
        </label>
      ) : null}

      {/* Tombol sm h-8 (32px): area sentuh 44px via pseudo vertikal, visual tetap. */}
      <Button variant="primary" size="sm" onPress={handleGenerate} className="relative before:absolute before:-inset-y-1.5 before:content-['']">
        Tampilkan
      </Button>
      </div>
    </div>
  )
}
