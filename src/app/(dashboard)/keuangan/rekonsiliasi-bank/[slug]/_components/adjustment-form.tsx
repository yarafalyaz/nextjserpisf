"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createReconciliationAdjustment } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"

// Formulir item penyesuaian: satu-satunya UI yang memanggil
// createReconciliationAdjustment. Sebelum ini item penyesuaian
// (type outstanding_deposit/outstanding_check) tidak punya jalur tulis —
// `completeReconciliation` menghitungnya tetapi tak ada yang bisa membuatnya,
// sehingga selisih tak pernah bisa dinolkan lewat UI.
//
// Field FormData yang dikirim: type ("outstanding_deposit" |
// "outstanding_check"), amount (nominal positif via CurrencyInput), date
// (YYYY-MM-DD hari kalender WIB), description (opsional).
export function AdjustmentForm({ reconciliationId }: { reconciliationId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState("")
  const [amount, setAmount] = useState<number>(0)

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    if (!type) {
      showError("Pilih jenis penyesuaian")
      return
    }
    startTransition(async () => {
      const res = await createReconciliationAdjustment(reconciliationId, new FormData(form))
      if (!res.success) {
        showError(res.error || "Gagal menambah penyesuaian")
        return
      }
      showSuccess("Item penyesuaian ditambahkan")
      form.reset()
      setType("")
      setAmount(0)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label="Tambah item penyesuaian"
    >
      <input type="hidden" name="type" value={type} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-52">
          <Label htmlFor="adjustmentType">Jenis *</Label>
          <FormSelect
            id="adjustmentType"
            value={type}
            onValueChange={setType}
            placeholder="-- Pilih Jenis --"
            options={[
              { value: "outstanding_deposit", label: "Setoran beredar" },
              { value: "outstanding_check", label: "Cek beredar" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-44">
          <Label htmlFor="adjustmentAmount">Nominal *</Label>
          <CurrencyInput
            id="adjustmentAmount"
            name="amount"
            required
            prefix="Rp"
            value={amount}
            onChange={setAmount}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-52">
          <AppDatePicker label="Tanggal *" name="date" required />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="adjustmentDescription">Deskripsi</Label>
          <Textarea
            id="adjustmentDescription"
            name="description"
            rows={2}
            placeholder="Keterangan penyesuaian (opsional)"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Tambah"}
          </Button>
        </div>
      </div>
    </form>
  )
}
