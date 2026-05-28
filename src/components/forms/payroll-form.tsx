"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState, useEffect } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { processPayroll, getPayrollEstimation } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label, InputGroup } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/page-header"
import { CheckCircle, Loader2 } from "lucide-react"

interface PayrollFormProps {
  employees: { id: number; name: string }[]
}

export function PayrollForm({ employees }: PayrollFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isEstimating, setIsEstimating] = useState(false)

  // Selection states for auto-calc trigger
  const [employeeId, setEmployeeId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")

  // Basic calculation states just for UI presentation
  const [baseSalary, setBaseSalary] = useState(0)
  const [allowances, setAllowances] = useState(0)
  const [overtime, setOvertime] = useState(0)
  const [appreciation, setAppreciation] = useState(0)
  const [deductions, setDeductions] = useState(0)
  const [loan, setLoan] = useState(0)
  const [late, setLate] = useState(0)

  // Auto-fetch data gaji & absensi
  useEffect(() => {
    if (employeeId && startDate && endDate) {
      setIsEstimating(true)
      getPayrollEstimation(employeeId, startDate, endDate)
        .then(data => {
          setBaseSalary(data.baseSalary)
          setOvertime(data.overtimeTotal)
          setAppreciation(data.appreciationTotal)
          setLoan(data.loanDeduction)
          setLate(data.lateDeduction)
        })
        .catch((e) => {
          showError("Gagal menarik data estimasi: " + e.message)
        })
        .finally(() => setIsEstimating(false))
    }
  }, [employeeId, startDate, endDate])

  // Gross = Base + Allowances + Overtime + Appreciation
  const grossSalary = baseSalary + allowances + overtime + appreciation
  // Total Deductions = Deductions + Loan + Late
  const totalDeductions = deductions + loan + late
  const netSalaryEst = grossSalary - totalDeductions

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        await processPayroll(formData)
        showSuccess("Payroll berhasil diproses")
        router.push("/sdm/penggajian")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal memproses payroll")
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
          <ComboBox name="employeeId" className="w-full" isRequired onSelectionChange={(key) => setEmployeeId(key ? Number(key) : null)}>
            <Label>Karyawan *</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Pilih karyawan..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {employees.map((e) => (
                  <ListBox.Item key={e.id} id={String(e.id)} textValue={e.name}>
                    {e.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="period">Periode Penggajian *</Label>
          <Input 
            id="period" 
            name="period" 
            value={endDate ? endDate.substring(0, 7) : ""} // Otomatis format "YYYY-MM" dari cut-off akhir
            isReadOnly 
            className="opacity-70"
            description="Otomatis diisi berdasarkan bulan pada Tanggal Selesai."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Mulai (Cut-off) *" name="startDate" onChange={(date) => setStartDate(date?.toString() || "")} required />
        </div>
        
        <div className="flex flex-col gap-1.5">
          <AppDatePicker label="Tanggal Selesai (Cut-off) *" name="endDate" onChange={(date) => setEndDate(date?.toString() || "")} required />
        </div>

        <div className="flex flex-col gap-1.5 md:col-span-2">
          <AppDatePicker label="Tanggal Rencana Pembayaran" name="paymentDate" onChange={() => {}} />
        </div>
      </div>

      <div className="p-6 border-y border-default bg-surface-secondary/30">
        <h2 className="text-lg font-semibold text-foreground">Komponen Pendapatan</h2>
        <p className="text-sm text-muted">Akan ditarik otomatis sesuai data master karyawan.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="baseSalary">Gaji Pokok *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="baseSalary" name="baseSalary" placeholder="0" required value={baseSalary} onChange={(v) => setBaseSalary(Number(v) || 0)} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="allowances">Tunjangan</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="allowances" name="allowances" placeholder="0" value={allowances} onChange={(v) => setAllowances(Number(v) || 0)} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="overtimeTotal">Total Lembur</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="overtimeTotal" name="overtimeTotal" placeholder="0" value={overtime} onChange={(v) => setOvertime(Number(v) || 0)} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="appreciationTotal">Total Apresiasi / Bonus</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="appreciationTotal" name="appreciationTotal" placeholder="0" value={appreciation} onChange={(v) => setAppreciation(Number(v) || 0)} />
          </InputGroup>
        </div>
      </div>

      <div className="p-6 border-y border-default bg-surface-secondary/30">
        <h2 className="text-lg font-semibold text-foreground">Komponen Potongan</h2>
        <p className="text-sm text-muted">Akan ditarik otomatis dari pinjaman aktif dan absensi keterlambatan.</p>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="deductions">Potongan Lainnya</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="deductions" name="deductions" placeholder="0" value={deductions} onChange={(v) => setDeductions(Number(v) || 0)} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loanDeduction">Potongan Pinjaman</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="loanDeduction" name="loanDeduction" placeholder="0" value={loan} onChange={(v) => setLoan(Number(v) || 0)} />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="lateDeduction">Potongan Terlambat</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <CurrencyInput id="lateDeduction" name="lateDeduction" placeholder="0" value={late} onChange={(v) => setLate(Number(v) || 0)} />
          </InputGroup>
        </div>
      </div>

      {/* Summary Box */}
      <div className="p-6 m-6 mt-0 bg-primary/5 rounded-xl border border-primary/20 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h3 className="font-semibold text-primary">Estimasi Gaji Bersih</h3>
          <p className="text-sm text-muted">Total otomatis terhitung dari data di atas</p>
        </div>
        <div className="text-2xl font-bold text-primary font-mono tabular-nums">
          Rp {netSalaryEst.toLocaleString("id-ID")}
        </div>
      </div>

      <div className="flex justify-end gap-3 p-6 border-t border-default bg-surface">
        <Button onPress={() => router.back()} variant="secondary">Batal</Button>
        <Button isDisabled={isPending || isEstimating} variant="primary">
          {isPending ? "Memproses..." : "Proses Payroll"}
        </Button>
      </div>
    </form>
  )
}
