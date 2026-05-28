"use client"

import { useState, useTransition } from "react"
import { 
  Modal, 
  Button, 
  useOverlayState,
  Input,
  Label
} from "@heroui/react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { generateBulkPayroll } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"

export function BulkGeneratePayrollButton() {
  const state = useOverlayState()
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [period, setPeriod] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  // Auto set period YYYY-MM if endDate changes
  const handleEndDateChange = (date: Date | null) => {
    const dateStr = date ? date.toString() : ""
    setEndDate(dateStr)
    if (dateStr) {
      setPeriod(dateStr.substring(0, 7))
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
          state.close()
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
        onPress={state.open}
        variant="solid" 
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white hover:-translate-y-px hover:shadow-md transition-all h-auto"
      >
        <Sparkles size={16} />
        Generate Gaji Bulanan
      </Button>

      <Modal.Backdrop isOpen={state.isOpen} onOpenChange={state.setOpen} variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header className="flex flex-col gap-1 text-xl font-bold">
              <Modal.Heading>⚡ Generate Gaji Bulanan (Bulk)</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 py-4">
              <p className="text-sm text-muted">
                Sistem akan otomatis membuat draf slip gaji untuk <strong>semua karyawan yang aktif</strong>, termasuk menghitung gaji pokok, bonus lembur/apresiasi, dan potongan pinjaman/telat secara otomatis.
              </p>
              
              <div className="flex flex-col gap-1.5">
                <AppDatePicker 
                  label="Tanggal Mulai Cut-off *" 
                  onChange={(d) => setStartDate(d ? d.toString() : "")} 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <AppDatePicker 
                  label="Tanggal Selesai Cut-off *" 
                  onChange={handleEndDateChange} 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bulk-period">Periode Penggajian</Label>
                <Input 
                  id="bulk-period" 
                  placeholder="Otomatis YYYY-MM" 
                  value={period} 
                  readOnly
                  onChange={() => {}}
                  className="opacity-80"
                />
              </div>
            </Modal.Body>
            <Modal.Footer className="border-t border-default/50">
              <Button variant="secondary" onPress={state.close} isDisabled={isPending}>
                Batal
              </Button>
              <Button 
                className="bg-indigo-600 text-white font-semibold"
                onPress={handleGenerate}
                isDisabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-1" />
                    Generating...
                  </>
                ) : "Mulai Generate"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
