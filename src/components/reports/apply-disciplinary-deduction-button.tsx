"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { applyDisciplinaryDeductionAction } from "@/actions/disciplinary-deduction.actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { showError, showSuccess } from "@/lib/utils/toast"
import { formatCurrencyExact } from "@/lib/utils/format"
import { wibDateOnly } from "@/lib/utils/date-only"

/**
 * Jalur MANUAL penerapan potongan disiplin (BR-DISC-09).
 *
 * Pemicu potongan = dokumen keputusan manusia; halaman ini yang memilih
 * PERIODE dan UPAH PEMBAYARAN (dasar plafon 50%), lalu memanggil service
 * untuk memposting jurnal Dr Hutang Gaji / Cr Denda (atau akun kompensasi).
 * Potongan TIDAK masuk `payroll.deductions`: jurnal payroll sudah mengkredit
 * Hutang Gaji untuk potongan, dan menambahkan leg kedua akan menggandakan
 * kredit yang sama.
 */
export function ApplyDisciplinaryDeductionButton({
  decisionId,
  documentNo,
  defaultPeriod,
}: Readonly<{ decisionId: number; documentNo: string; defaultPeriod: string }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [terbuka, setTerbuka] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod)
  const [periodPay, setPeriodPay] = useState("")
  const [tanggal, setTanggal] = useState(() => wibDateOnly(new Date()))

  function terapkan() {
    startTransition(async () => {
      try {
        const res = await applyDisciplinaryDeductionAction({
          decisionId,
          period,
          periodPay: Number(periodPay.replace(/[^\d]/g, "")) || 0,
          transactionDate: tanggal,
        })
        if (!res.success) {
          showError(res.error || "Gagal menerapkan potongan disiplin")
          return
        }
        showSuccess(
          res.replayed
            ? `Potongan periode ${period} sudah pernah diterapkan, tidak ada jurnal baru`
            : `Potongan periode ${period} diposting ${formatCurrencyExact(Number(res.amount ?? 0))}`,
        )
        setTerbuka(false)
        setPeriodPay("")
        router.refresh()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal menerapkan potongan disiplin")
      }
    })
  }

  if (!terbuka) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 sm:min-h-9"
        onClick={() => setTerbuka(true)}
        aria-label={`Terapkan potongan ${documentNo} ke periode payroll`}
      >
        Terapkan ke Periode
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/50 bg-warning-soft p-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`period-${decisionId}`}>Periode payroll (YYYY-MM)</Label>
        <Input
          id={`period-${decisionId}`}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="2026-11"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`pay-${decisionId}`}>Upah pembayaran periode ini</Label>
        <Input
          id={`pay-${decisionId}`}
          value={periodPay}
          onChange={(e) => setPeriodPay(e.target.value)}
          placeholder="5000000"
          inputMode="numeric"
        />
        <p className="text-xs text-muted-foreground">
          Dasar plafon 50% potongan disiplin. Kosong atau nol ditolak.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`tgl-${decisionId}`}>Tanggal transaksi jurnal</Label>
        <Input
          id={`tgl-${decisionId}`}
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="primary"
          className="min-h-11 sm:min-h-9"
          isDisabled={isPending}
          onClick={terapkan}
        >
          {isPending ? "Memproses..." : "Terapkan & Posting"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 sm:min-h-9"
          isDisabled={isPending}
          onClick={() => setTerbuka(false)}
        >
          Batal
        </Button>
      </div>
    </div>
  )
}
