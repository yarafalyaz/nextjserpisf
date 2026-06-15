"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"
import { AppDatePicker } from "@/components/ui/date-picker"
import { generateBulkPayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"

export function BulkGeneratePayrollButton({ cutoffDay = 25 }: { cutoffDay?: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [period, setPeriod] = useState("") // format "YYYY-MM"
  const [startDate, setStartDate] = useState("") // format "YYYY-MM-DD"
  const [endDate, setEndDate] = useState("") // format "YYYY-MM-DD"
  const [isManual, setIsManual] = useState(false)

  // Handle month selection and auto-calculate dates based on system cutoffDay setting
  const handlePeriodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value // e.g. "2026-05"
    setPeriod(rawVal)

    if (rawVal) {
      const [yearStr, monthStr] = rawVal.split("-")
      const year = parseInt(yearStr, 10)
      const month = parseInt(monthStr, 10) // 1-12

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

  const handleGenerate = () => {
    if (!period || !startDate || !endDate) {
      showError("Semua field wajib diisi!")
      return
    }

    startTransition(async () => {
      try {
        const res = await generateBulkPayroll(period, startDate, endDate)
        if (res.success) {
          showSuccess(`Berhasil men-generate ${res.count} draf slip gaji untuk periode ${period}!`)
          setIsOpen(false)
          router.refresh()
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal generate slip gaji")
      }
    })
  }

  return (
    <>
      <Button
        onPress={() => setIsOpen(true)}
        variant="primary"
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white hover:-translate-y-px hover:shadow-md transition-all h-auto"
      >
        <Sparkles size={16} />
        Generate Gaji Bulanan
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Generate Gaji Bulanan (Bulk)</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Sistem akan otomatis membuat draf slip gaji untuk <strong>semua karyawan yang aktif</strong>. Tanggal cut-off akan diatur otomatis berdasarkan pengaturan sistem (tgl {cutoffDay}).
            </p>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="period-picker">Pilih Periode Bulan *</Label>
              <Input
                id="period-picker"
                type="month"
                value={period}
                onChange={handlePeriodChange}
                className="w-full"
              />
            </div>

            {!isManual ? (
              <div className="grid grid-cols-2 gap-4 bg-default-100/50 p-3 rounded-lg border border-default/50 text-xs">
                <div>
                  <span className="text-muted-foreground block mb-0.5">Mulai Cut-off</span>
                  <span className="font-semibold text-foreground text-sm">{startDate ? new Date(startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Selesai Cut-off</span>
                  <span className="font-semibold text-foreground text-sm">{endDate ? new Date(endDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : "-"}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <AppDatePicker
                    label="Tanggal Mulai Cut-off *"
                    name="startDate"
                    value={startDate}
                    onChange={(d) => setStartDate(d ? d.toString() : "")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <AppDatePicker
                    label="Tanggal Selesai Cut-off *"
                    name="endDate"
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
          </div>

          <DialogFooter className="border-t border-default/50 pt-4">
            <Button variant="secondary" onPress={() => setIsOpen(false)} isDisabled={isPending}>
              Batal
            </Button>
            <Button
              variant="primary"
              onPress={handleGenerate}
              isDisabled={isPending || !period}
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-1" />
                  Generating...
                </>
              ) : "Mulai Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
