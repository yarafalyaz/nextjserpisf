"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronRight } from "@/components/ui/fontawesome-icons"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible"
import {
  countChangedStatementOptions,
  DEFAULT_STATEMENT_OPTIONS,
  encodeStatementOptions,
  STATEMENT_OPTIONS_COOKIE,
  type StatementDisplayOptions,
} from "@/lib/reports/statement-display"
import { buildReportPeriodSlug } from "@/lib/reports/report-period"
import { buildReportHref } from "@/lib/reports/report-href"
import { parseLocalDateOnly, toLocalDateOnly } from "@/lib/utils/date-only"

interface StatementOptionsProps {
  /** Basis rute laporan, mis. "/laporan/laba-rugi" — periode masuk sebagai slug. */
  basePath: string
  defaultStartDate: string
  defaultEndDate: string
  /** Opsi yang sedang aktif (dibaca server dari cookie). */
  currentOptions: StatementDisplayOptions
  /** Kolom "% dari Pendapatan" (hanya untuk Laba Rugi). */
  showPercentColumn?: boolean
  currentPercent?: boolean
  /** Neraca memakai tanggal tunggal ("Per") alih-alih rentang. */
  singleDate?: boolean
  extraDate?: { param: string; label: string; value: string }
  /**
   * Filter lain yang harus dipertahankan saat periode diterapkan — nilainya
   * sudah berbentuk kunci URL (mis. `{ pembanding: "2026-09-30" }`).
   */
  filters?: Record<string, string | undefined>
}

const OPTION_LABELS: { key: keyof StatementDisplayOptions; label: string; hint: string }[] = [
  { key: "totalsOnly", label: "Hanya Tampilkan Total", hint: "Sembunyikan rincian akun, tampilkan subtotal per kelompok saja" },
  { key: "showParents", label: "Tampilkan Akun Induk", hint: "Tampilkan akun induk (header) beserta saldo gabungan anaknya" },
  { key: "showChildren", label: "Tampilkan Akun Anak", hint: "Tampilkan akun rinci di bawah akun induknya" },
  { key: "showZeroBalance", label: "Tampilkan data dengan Saldo Nol", hint: "Ikut menampilkan akun yang saldonya 0" },
  { key: "showParentBalance", label: "Tampilkan Saldo Akun Induk", hint: "Isi saldo akun induk dari penjumlahan akun anaknya" },
]

interface OptionRowProps {
  id: string
  label: string
  hint: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function OptionRow({ id, label, hint, checked, onCheckedChange }: OptionRowProps) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <label htmlFor={id} className="cursor-pointer text-sm text-foreground">
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </label>
    </div>
  )
}

export function StatementOptions({
  basePath,
  defaultStartDate,
  defaultEndDate,
  currentOptions,
  showPercentColumn = false,
  currentPercent = false,
  singleDate = false,
  extraDate,
  filters,
}: StatementOptionsProps) {
  const router = useRouter()
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)
  const [extraDateValue, setExtraDateValue] = useState(extraDate?.value ?? "")
  const [options, setOptions] = useState<StatementDisplayOptions>(currentOptions)
  const [percent, setPercent] = useState(currentPercent)
  const [open, setOpen] = useState(false)

  // The badge reports what the operator changed, not how many boxes are ticked.
  const changedCount = countChangedStatementOptions(options, showPercentColumn && percent)

  function handleReset() {
    setOptions({ ...DEFAULT_STATEMENT_OPTIONS })
    setPercent(false)
  }

  function handleGenerate() {
    // Display toggles are a viewing preference, so they live in a cookie — the
    // address bar keeps only the report's own period slug.
    document.cookie = `${STATEMENT_OPTIONS_COOKIE}=${encodeURIComponent(
      encodeStatementOptions(options, percent && showPercentColumn),
    )}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`

    const start = parseLocalDateOnly(startDate)
    const end = singleDate ? start : parseLocalDateOnly(endDate)
    const slug = end < start ? buildReportPeriodSlug(start, start) : buildReportPeriodSlug(start, end)

    router.push(
      buildReportHref(basePath, slug, {
        ...filters,
        ...(extraDate ? { [extraDate.param]: extraDateValue || undefined } : {}),
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
    <div role="search" aria-label="Parameter laporan" className="rounded-xl border border-default bg-surface p-4 flex flex-col gap-3 print:hidden">
      {/* Preset cepat */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground/80 mr-1">Preset:</span>
        {!singleDate ? (
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

      <div className="flex flex-wrap items-end gap-4">
        {singleDate ? (
          <AppDatePicker label="Per tanggal" name="periode" value={startDate} onChange={setStartDate} className="w-full sm:w-[180px]" />
        ) : (
          <>
            <AppDatePicker label="Dari" name="periodeMulai" value={startDate} onChange={setStartDate} className="w-full sm:w-[180px]" />
            <AppDatePicker label="s/d" name="periodeSelesai" value={endDate} onChange={setEndDate} className="w-full sm:w-[180px]" />
          </>
        )}
        <Button variant="primary" size="sm" onPress={handleGenerate}>Tampilkan</Button>
        {extraDate ? (
          <AppDatePicker
            label={extraDate.label}
            name={extraDate.param}
            value={extraDateValue}
            onChange={setExtraDateValue}
            className="w-full sm:w-[220px]"
          />
        ) : null}
      </div>

      {/* Collapsed by default: the options are a viewing preference most operators
          set once, and leaving them open pushed the report itself below the fold. */}
      <Collapsible open={open} onOpenChange={setOpen} className="border-t border-default pt-2">
        <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-surface-secondary">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-data-[state=open]:rotate-90" />
          <span className="text-sm font-semibold text-foreground">Parameter Tambahan</span>
          {changedCount > 0 && <Badge variant="outline">{changedCount} disesuaikan</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">{open ? "Sembunyikan" : "Buka"}</span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 pt-3">
            {OPTION_LABELS.map((option) => (
              <OptionRow
                key={option.key}
                id={`opsi-${option.key}`}
                label={option.label}
                hint={option.hint}
                checked={options[option.key]}
                onCheckedChange={(checked) => setOptions((prev) => ({ ...prev, [option.key]: checked }))}
              />
            ))}
            {showPercentColumn && (
              <OptionRow
                id="opsi-persen"
                label="Kolom % dari Pendapatan"
                hint="Tampilkan setiap baris sebagai persentase pendapatan"
                checked={percent}
                onCheckedChange={setPercent}
              />
            )}
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onPress={handleReset} isDisabled={changedCount === 0}>
              Atur ulang ke bawaan
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
