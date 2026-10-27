"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowRight } from "lucide-react"

import { createPurchaseAdvance } from "@/actions/purchase-advance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { AppDatePicker } from "@/components/ui/date-picker"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export interface AccountOption {
  id: number
  code: string
  name: string
}

export function PurchaseAdvanceForm({
  vendors,
  paymentAccounts,
  assetAccounts,
  defaultAdvanceAccountId,
}: {
  vendors: { id: number; name: string }[]
  paymentAccounts: AccountOption[]
  assetAccounts: AccountOption[]
  defaultAdvanceAccountId: number | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [date, setDate] = useState(toLocalDateOnly(new Date()))
  const [vendorId, setVendorId] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [advanceAccountId, setAdvanceAccountId] = useState(
    defaultAdvanceAccountId ? String(defaultAdvanceAccountId) : "",
  )
  const [paymentAccountId, setPaymentAccountId] = useState("")
  const [description, setDescription] = useState("")

  const vendorOptions = vendors.map((vendor) => ({ value: String(vendor.id), label: vendor.name }))
  const paymentOptions = paymentAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))
  const assetOptions = assetAccounts.map((account) => ({
    value: String(account.id),
    label: `${account.code} - ${account.name}`,
  }))

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("date", date)
        formData.set("vendorId", vendorId)
        formData.set("amount", amount === null ? "" : String(amount))
        formData.set("advanceAccountId", advanceAccountId)
        formData.set("paymentAccountId", paymentAccountId)
        formData.set("description", description)

        const result = await createPurchaseAdvance(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan uang muka")
          return
        }
        showSuccess("Uang muka pembelian tersimpan dan jurnalnya diposting")
        router.push("/pembelian/uang-muka")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan uang muka")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border border-default bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <AppDatePicker label="Tanggal *" name="date" value={date} onChange={setDate} required />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah Uang Muka *</Label>
          <CurrencyInput id="amount" value={amount} onChange={setAmount} placeholder="0" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vendorId">Pemasok *</Label>
          <Combobox
            id="vendorId"
            options={vendorOptions}
            value={vendorId || null}
            onChange={(value) => setVendorId(value ?? "")}
            placeholder="Pilih pemasok..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="advanceAccountId">Akun Uang Muka (aset) *</Label>
          <Combobox
            id="advanceAccountId"
            options={assetOptions}
            value={advanceAccountId || null}
            onChange={(value) => setAdvanceAccountId(value ?? "")}
            placeholder="Mis. 110302 Uang Muka Pembelian IDR"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentAccountId">Dibayar dari Kas/Bank *</Label>
          <Combobox
            id="paymentAccountId"
            options={paymentOptions}
            value={paymentAccountId || null}
            onChange={(value) => setPaymentAccountId(value ?? "")}
            placeholder="Pilih rekening kas/bank..."
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="description">Keterangan</Label>
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Keterangan uang muka (opsional)"
            rows={2}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-5">
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Jurnal: Dr akun uang muka <ArrowRight size={12} aria-hidden="true" /> Cr kas/bank
        </p>
        <div className="flex gap-3">
          <Button type="button" onPress={() => router.back()} isDisabled={isPending}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending} id="submit-purchase-advance">
            {isPending ? "Menyimpan..." : "Simpan & Posting"}
          </Button>
        </div>
      </div>
    </form>
  )
}
