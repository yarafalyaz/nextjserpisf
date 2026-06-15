/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState, useEffect, useRef } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { processPayroll, getPayrollEstimation } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/page-header"
import { CheckCircle, Loader2 } from "lucide-react"

interface PayrollFormProps {
  employees: { id: number; name: string }[]
  initialData?: any
}

import { updatePayroll } from "@/actions/hrm.actions"
export function PayrollForm({ employees, initialData }: PayrollFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isEstimating, setIsEstimating] = useState(false)

  // Selection states for auto-calc trigger
  const [employeeId, setEmployeeId] = useState<number | null>(initialData?.employeeId || null)
  const [startDate, setStartDate] = useState<string>(initialData?.startDate ? new Date(initialData.startDate).toISOString().substring(0,10) : "")
  const [endDate, setEndDate] = useState<string>(initialData?.endDate ? new Date(initialData.endDate).toISOString().substring(0,10) : "")

  // Basic calculation states just for UI presentation
  const [baseSalary, setBaseSalary] = useState(Number(initialData?.baseSalary) || 0)
  const [allowances, setAllowances] = useState(Number(initialData?.allowances) || 0)
  const [overtime, setOvertime] = useState(Number(initialData?.overtimeTotal) || 0)
  const [appreciation, setAppreciation] = useState(Number(initialData?.appreciationTotal) || 0)
  const [deductions, setDeductions] = useState(Number(initialData?.deductions) || 0)
  const [loan, setLoan] = useState(Number(initialData?.loanDeduction) || 0)
  const [late, setLate] = useState(Number(initialData?.lateDeduction) || 0)
  const [absentDeduction, setAbsentDeduction] = useState(Number(initialData?.absentDeduction) || 0)
  const [attendance, setAttendance] = useState({
    workingDays: Number(initialData?.workingDays) || 0,
    presentDays: Number(initialData?.presentDays) || 0,
    leaveDays: 0,
    holidayDays: 0,
    absentDays: Number(initialData?.absentDays) || 0,
  })

  // Auto-fetch data gaji & absensi
  const shouldSkipInitialEstimate = useRef(Boolean(initialData))
  useEffect(() => {
    if (shouldSkipInitialEstimate.current) {
      shouldSkipInitialEstimate.current = false
      return
    }
    if (!employeeId || !startDate || !endDate) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      setIsEstimating(true)
      getPayrollEstimation(employeeId, startDate, endDate)
        .then(data => {
          if (cancelled) return
          if (data && "error" in data) {
            showError("Gagal menarik data estimasi: " + data.error)
            return
          }
          if (!data) return
          setBaseSalary(data.baseSalary ?? 0)
          setOvertime(data.overtimeTotal ?? 0)
          setAppreciation(data.appreciationTotal ?? 0)
          setLoan(data.loanDeduction ?? 0)
          setLate(data.lateDeduction ?? 0)
          setAbsentDeduction(data.absentDeduction ?? 0)
          setAttendance({
            workingDays: data.workingDays ?? 0,
            presentDays: data.presentDays ?? 0,
            leaveDays: data.leaveDays ?? 0,
            holidayDays: data.holidayDays ?? 0,
            absentDays: data.absentDays ?? 0,
          })
        })
        .catch((e) => {
          if (cancelled) return
          showError("Gagal menarik data estimasi: " + e.message)
        })
        .finally(() => {
          if (!cancelled) setIsEstimating(false)
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [employeeId, startDate, endDate])

  // Gross = Base + Allowances + Overtime + Appreciation
  const grossSalary = baseSalary + allowances + overtime + appreciation
  // Total Deductions = Deductions + Loan + Late + Absent (bolos)
  const totalDeductions = deductions + loan + late + absentDeduction
  const netSalaryEst = grossSalary - totalDeductions

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = initialData?.id ? await updatePayroll(initialData.id, formData) : await processPayroll(formData)
        if (result && !result.success) { showError(result.error || "Gagal memproses penggajian"); return }
        showSuccess("Penggajian berhasil diproses")
        router.push("/sdm/penggajian")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal memproses penggajian")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-6 border-b border-default bg-surface-secondary/30 flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle className="text-primary" size={18} />
          Informasi Utama
        </h2>
        {isEstimating && (
          <span className="text-xs text-primary flex items-center gap-1.5 font-medium bg-primary/10 px-2.5 py-1 rounded-full animate-pulse">
            <Loader2 size={12} className="animate-spin" /> Menarik data absensi & gaji...
          </span>
        )}
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employeeId">Karyawan *</Label>
          <Combobox
            id="employeeId"
            name="employeeId"
            options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
            value={employeeId ? String(employeeId) : null}
            onChange={(key) => setEmployeeId(key ? Number(key) : null)}
            placeholder="Pilih karyawan..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period">Periode Penggajian *</Label>
          <Input 
            id="period" 
            name="period" 
            value={endDate ? endDate.substring(0, 7) : ""} // Otomatis format "YYYY-MM" dari cut-off akhir
            readOnly 
            onChange={() => {}}
            className="opacity-70"
          />
          <p className="text-xs text-muted-foreground">Otomatis diisi berdasarkan bulan pada Tanggal Selesai.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Mulai (Cut-off) *" name="startDate" defaultValue={initialData?.startDate ? new Date(initialData.startDate).toISOString().substring(0, 10) : undefined} onChange={(date) => setStartDate(date?.toString() || "")} required />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Selesai (Cut-off) *" name="endDate" defaultValue={initialData?.endDate ? new Date(initialData.endDate).toISOString().substring(0, 10) : undefined} onChange={(date) => setEndDate(date?.toString() || "")} required />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <AppDatePicker label="Tanggal Rencana Pembayaran" name="paymentDate" defaultValue={initialData?.paymentDate ? new Date(initialData.paymentDate).toISOString().substring(0, 10) : undefined} onChange={() => {}} />
        </div>
      </div>

      <div className="p-6 border-y border-default bg-surface-secondary/30">
        <h2 className="text-lg font-semibold text-foreground">Komponen Pendapatan</h2>
        <p className="text-sm text-muted-foreground">Akan ditarik otomatis sesuai data master karyawan.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="baseSalary">Gaji Pokok *</Label>
          <CurrencyInput id="baseSalary" name="baseSalary" placeholder="0" required value={baseSalary} onChange={(v) => setBaseSalary(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="allowances">Tunjangan</Label>
          <CurrencyInput id="allowances" name="allowances" placeholder="0" value={allowances} onChange={(v) => setAllowances(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="overtimeTotal">Total Lembur</Label>
          <CurrencyInput id="overtimeTotal" name="overtimeTotal" placeholder="0" value={overtime} onChange={(v) => setOvertime(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="appreciationTotal">Total Apresiasi / Bonus</Label>
          <CurrencyInput id="appreciationTotal" name="appreciationTotal" placeholder="0" value={appreciation} onChange={(v) => setAppreciation(Number(v) || 0)} prefix="Rp" />
        </div>
      </div>

      <div className="p-6 border-y border-default bg-surface-secondary/30">
        <h2 className="text-lg font-semibold text-foreground">Komponen Potongan</h2>
        <p className="text-sm text-muted-foreground">Akan ditarik otomatis dari pinjaman aktif dan absensi keterlambatan.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deductions">Potongan Lainnya</Label>
          <CurrencyInput id="deductions" name="deductions" placeholder="0" value={deductions} onChange={(v) => setDeductions(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loanDeduction">Potongan Pinjaman</Label>
          <CurrencyInput id="loanDeduction" name="loanDeduction" placeholder="0" value={loan} onChange={(v) => setLoan(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="lateDeduction">Potongan Terlambat</Label>
          <CurrencyInput id="lateDeduction" name="lateDeduction" placeholder="0" value={late} onChange={(v) => setLate(Number(v) || 0)} prefix="Rp" />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="absentDeduction">Potongan Tidak Hadir (Bolos)</Label>
          <CurrencyInput id="absentDeduction" name="absentDeduction" placeholder="0" value={absentDeduction} onChange={(v) => setAbsentDeduction(Number(v) || 0)} prefix="Rp" />
          <p className="text-xs text-muted-foreground">Otomatis dari hari kerja tanpa absen &amp; tanpa cuti. Tanggal merah/libur tidak dihitung bolos.</p>
        </div>
      </div>

      {/* Hidden inputs to persist attendance summary */}
      <input type="hidden" name="workingDays" value={attendance.workingDays} />
      <input type="hidden" name="presentDays" value={attendance.presentDays} />
      <input type="hidden" name="absentDays" value={attendance.absentDays} />

      {/* Attendance summary panel */}
      <div className="px-6 pb-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-default bg-surface-secondary/40 p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-foreground">{attendance.workingDays}</div>
            <div className="text-xs text-muted-foreground">Hari Kerja</div>
          </div>
          <div className="rounded-lg border border-default bg-emerald-500/5 p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{attendance.presentDays}</div>
            <div className="text-xs text-muted-foreground">Hadir</div>
          </div>
          <div className="rounded-lg border border-default bg-blue-500/5 p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">{attendance.holidayDays + attendance.leaveDays}</div>
            <div className="text-xs text-muted-foreground">Libur / Cuti</div>
          </div>
          <div className="rounded-lg border border-default bg-red-500/5 p-3 text-center">
            <div className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{attendance.absentDays}</div>
            <div className="text-xs text-muted-foreground">Bolos</div>
          </div>
        </div>
      </div>

      {/* Summary Box */}
      <div className="p-6 m-6 mt-0 bg-primary/5 rounded-xl border border-primary/20 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="font-semibold text-primary">Estimasi Gaji Bersih</h3>
          <p className="text-sm text-muted-foreground">Total otomatis terhitung dari data di atas</p>
        </div>
        <div className="text-2xl font-bold text-primary font-mono tabular-nums">
          Rp {netSalaryEst.toLocaleString("id-ID")}
        </div>
      </div>

      <div className="flex justify-end gap-3 p-6 border-t border-default bg-surface">
        <Button type="button" onPress={() => router.back()} variant="secondary">Batal</Button>
        <Button type="submit" isDisabled={isPending || isEstimating} variant="primary">
          {isPending ? "Memproses..." : initialData ? "Simpan Perubahan" : "Proses Penggajian"}
        </Button>
      </div>
    </form>
  )
}
