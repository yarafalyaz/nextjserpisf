"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { AppMonthPicker } from "@/components/ui/month-picker"
import { generateBulkPayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PAYROLL_FREQUENCIES,
  type PayrollFrequency,
  type PayrollRunSkipReason,
} from "@/lib/reports/payroll-frequency"
import {
  isMondayYmd,
  mondayOnOrBefore,
  payrollRunSkipLines,
  weeklyEndFromStart,
  weeklyPeriodFromEndDate,
} from "./bulk-payroll-run-helpers"

const FREQUENCY_LABELS: Record<PayrollFrequency, string> = {
  MONTHLY: "Bulanan",
  WEEKLY: "Mingguan",
}

interface PayrollRunResult {
  frequency: PayrollFrequency
  period: string
  count: number
  skippedTotal: number
  skippedByReason: Record<PayrollRunSkipReason, number>
}

export function BulkGeneratePayrollButton({ cutoffDay = 25 }: { cutoffDay?: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [frequency, setFrequency] = useState<PayrollFrequency>("MONTHLY")

  // Bulanan: period "YYYY-MM" dari pemilih bulan + rentang cut-off existing.
  const [period, setPeriod] = useState("") // format "YYYY-MM"
  const [startDate, setStartDate] = useState("") // format "YYYY-MM-DD"
  const [endDate, setEndDate] = useState("") // format "YYYY-MM-DD"
  const [isManual, setIsManual] = useState(false)

  // Mingguan: mulai Senin (default Senin minggu ini), selesai turunan 7 hari
  // (boleh sunting manual), period otomatis "YYYY-MM" bulan tanggal selesai,
  // TANPA cutoffDay. ponytail: default dihitung saat mount, bukan server —
  // sekadar praseleksi pemilih; server tetap memvalidasi rentang apa adanya.
  const [weeklyStart, setWeeklyStart] = useState(() =>
    mondayOnOrBefore(new Date().toISOString().slice(0, 10)),
  )
  const [weeklyEnd, setWeeklyEnd] = useState(() =>
    weeklyEndFromStart(mondayOnOrBefore(new Date().toISOString().slice(0, 10))),
  )

  const [result, setResult] = useState<PayrollRunResult | null>(null)

  // Handle month selection and auto-calculate dates based on system cutoffDay setting
  const handlePeriodChange = (rawVal: string) => {
    setPeriod(rawVal)

    if (rawVal) {
      const [yearStr, monthStr] = rawVal.split("-")
      const year = Number.parseInt(yearStr, 10)
      const month = Number.parseInt(monthStr, 10) // 1-12

      // End Date: selected-month-cutoffDay
      const endObj = new Date(year, month - 1, cutoffDay)
      // Start Date: (cutoffDay + 1) of the previous month
      // Previous month of Jan (1) is Dec of previous year, Date handles this automatically.
      const startObj = new Date(year, month - 2, cutoffDay + 1)

      // Format YYYY-MM-DD
      const pad = (n: number) => String(n).padStart(2, '0')
      const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

      setStartDate(formatYMD(startObj))
      setEndDate(formatYMD(endObj))
    } else {
      setStartDate("")
      setEndDate("")
    }
  }

  const handleWeeklyStartChange = (next: string) => {
    setWeeklyStart(next)
    setWeeklyEnd(next ? weeklyEndFromStart(next) : "")
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) setResult(null)
  }

  const handleOpen = () => {
    setResult(null)
    setIsOpen(true)
  }

  const weeklyPeriod = weeklyPeriodFromEndDate(weeklyEnd)
  const canGenerate =
    frequency === "MONTHLY" ? Boolean(period && startDate && endDate) : Boolean(weeklyStart && weeklyEnd)

  const handleGenerate = () => {
    const runPeriod = frequency === "MONTHLY" ? period : weeklyPeriod
    const runStart = frequency === "MONTHLY" ? startDate : weeklyStart
    const runEnd = frequency === "MONTHLY" ? endDate : weeklyEnd
    if (!runPeriod || !runStart || !runEnd) {
      showError("Semua kolom wajib diisi!")
      return
    }

    startTransition(async () => {
      try {
        const res = await generateBulkPayroll(runPeriod, runStart, runEnd, frequency)
        if (res.success) {
          setResult({
            frequency,
            period: runPeriod,
            count: res.count ?? 0,
            skippedTotal: res.skippedTotal ?? 0,
            skippedByReason: res.skippedByReason ?? {
              frekuensiLain: 0,
              pinjaman: 0,
              bpjsBelumDidukung: 0,
              plafonPotongan: 0,
              irisan: 0,
              berhenti: 0,
              cakupan: 0,
            },
          })
          showSuccess(`Berhasil membuat ${res.count ?? 0} draf slip gaji untuk periode ${runPeriod}!`)
          router.refresh()
        } else {
          // Kontrak server: {success:false, error} — pesan server tampil apa adanya.
          showError(res.error ?? "Gagal membuat slip gaji")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal membuat slip gaji")
      }
    })
  }

  const skipLines = result ? payrollRunSkipLines(result.skippedByReason) : []

  return (
    <>
      <Button
        onPress={handleOpen}
        variant="primary"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white hover:-translate-y-px hover:shadow-md transition-all h-auto"
      >
        <Sparkles size={16} />
        Buat Gaji Bulanan
      </Button>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Buat Gaji Bulanan (Massal)</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <span id="payroll-run-frequency-label" className="text-sm font-medium text-foreground">
                Frekuensi Run *
              </span>
              <div role="radiogroup" aria-labelledby="payroll-run-frequency-label" className="flex gap-2">
                {PAYROLL_FREQUENCIES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={frequency === value}
                    onClick={() => setFrequency(value)}
                    className={cn(
                      "min-h-11 flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all",
                      frequency === value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-default bg-surface text-muted-foreground hover:bg-surface-secondary",
                    )}
                  >
                    {FREQUENCY_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>

            {frequency === "MONTHLY" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Sistem akan otomatis membuat draf slip gaji untuk <strong>semua karyawan yang aktif</strong>. Tanggal cut-off akan diatur otomatis berdasarkan pengaturan sistem (tgl {cutoffDay}).
                </p>

                <AppMonthPicker
                  label="Pilih Periode Bulan *"
                  name="period"
                  value={period}
                  onChange={handlePeriodChange}
                  required
                  className="w-full"
                />

                {!isManual ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-default-100/50 p-3 rounded-lg border border-default/50 text-xs">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Mulai Cut-off</span>
                      <span className="font-semibold text-foreground text-sm">{startDate ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : "-"}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">Selesai Cut-off</span>
                      <span className="font-semibold text-foreground text-sm">{endDate ? new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : "-"}</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <AppDatePicker
                        label="Tanggal Mulai Cut-off *"
                        name="startDate"
                        required
                        value={startDate}
                        onChange={(d) => setStartDate(d ? d.toString() : "")}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <AppDatePicker
                        label="Tanggal Selesai Cut-off *"
                        name="endDate"
                        required
                        value={endDate}
                        onChange={(d) => setEndDate(d ? d.toString() : "")}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 mt-1">
                  <Checkbox
                    id="toggle-manual"
                    checked={isManual}
                    onCheckedChange={(c) => setIsManual(c === true)}
                  />
                  <Label htmlFor="toggle-manual" className="text-xs text-muted-foreground cursor-pointer select-none">
                    Ubah Tanggal Cut-off Secara Manual
                  </Label>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Run mingguan membuat draf slip gaji untuk <strong>karyawan berfrekuensi mingguan</strong> pada rentang 7 hari mulai Senin. Karyawan yang belum didukung tahap ini terhitung sebagai terlewati dengan alasannya.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <AppDatePicker
                      label="Tanggal Mulai (Senin) *"
                      name="weeklyStartDate"
                      required
                      value={weeklyStart}
                      onChange={handleWeeklyStartChange}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <AppDatePicker
                      label="Tanggal Selesai *"
                      name="weeklyEndDate"
                      required
                      value={weeklyEnd}
                      onChange={(d) => setWeeklyEnd(d ? d.toString() : "")}
                    />
                  </div>
                </div>

                {weeklyStart && !isMondayYmd(weeklyStart) ? (
                  <p className="text-xs text-muted-foreground">
                    Tanggal mulai bukan hari Senin — rentang tetap dikirim apa adanya untuk diputuskan server.
                  </p>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-default-100/50 p-3 rounded-lg border border-default/50 text-xs">
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Periode (dari Tanggal Selesai)</span>
                    <span className="font-semibold text-foreground text-sm">{weeklyPeriod || "-"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block mb-0.5">Frekuensi Run</span>
                    <span className="font-semibold text-foreground text-sm">Mingguan</span>
                  </div>
                </div>
              </>
            )}

            {result ? (
              <div role="status" className="flex flex-col gap-2 rounded-lg border border-default/50 bg-default-100/50 p-3 text-sm">
                <p className="font-semibold text-foreground">
                  Hasil run {FREQUENCY_LABELS[result.frequency]} periode {result.period}: {result.count} draf slip dibuat, {result.skippedTotal} karyawan terlewati.
                </p>
                {skipLines.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {skipLines.map((line) => (
                      <li key={line.reason} className="flex items-baseline justify-between gap-3">
                        <span>{line.label}</span>
                        <span className="font-semibold text-foreground">{line.count}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t border-default/50 pt-4">
            <Button variant="secondary" onPress={() => setIsOpen(false)} isDisabled={isPending}>
              Batal
            </Button>
            <Button
              variant="primary"
              onPress={handleGenerate}
              isDisabled={isPending || !canGenerate}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1" />
                  Memproses...
                </>
              ) : "Mulai Buat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
