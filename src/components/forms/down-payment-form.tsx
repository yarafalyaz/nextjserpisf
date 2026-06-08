"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createDownPayment, updateDownPayment } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/page-header"

const downPaymentSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  quotationId: z.number({ error: "Penawaran wajib dipilih" }).min(1, "Penawaran wajib dipilih"),
  amount: z.number({ error: "Jumlah wajib diisi" }).min(1, "Jumlah harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi"),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib dipilih"),
  notes: z.string().optional()})

type DownPaymentInput = z.infer<typeof downPaymentSchema>

interface DownPaymentFormProps {
  customers: { id: number; name: string
}[]
  downPayment?: { id: number; customerId: number; amount: number; date: string; accountId?: number | null; notes?: string | null; salesOrderId?: number | null; quotationId?: number | null }
  quotations: { id: number; documentNo: string; customerId: number }[]
  defaultQuotationId?: number
  defaultCustomerId?: number
  paymentMethods?: { code: string; name: string }[]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DownPaymentForm({ customers, quotations, downPayment, defaultQuotationId, defaultCustomerId, paymentMethods = [] }: DownPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [proofFile, setProofFile] = useState<File | null>(null)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<DownPaymentInput>({
    resolver: zodResolver(downPaymentSchema),
    defaultValues: {
      customerId: downPayment?.customerId,
      quotationId: downPayment?.quotationId ?? undefined,
      amount: downPayment?.amount,
      paymentDate: downPayment?.date ?? new Date().toISOString().split("T")[0],
      paymentMethod: "",
      notes: downPayment?.notes ?? ""}})

  const selectedCustomerId = watch("customerId")
  const filteredQuotations = quotations.filter(
    (q) => !selectedCustomerId || q.customerId === selectedCustomerId
  )

  function onSubmit(data: DownPaymentInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") formData.append(key, String(value))
        })
        if (proofFile) {
          formData.append("proofImage", proofFile)
        }
        const result = downPayment?.id ? await updateDownPayment(downPayment.id, formData) : await createDownPayment(formData)
        if (result.success) {
          showSuccess(downPayment?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push("/penjualan/uang-muka")
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label>Pelanggan *</Label>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <Combobox
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                placeholder="Cari pelanggan..."
                options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            )}
          />
          {errors.customerId && <span className="text-xs text-danger mt-1">{errors.customerId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Penawaran *</Label>
          <Controller
            name="quotationId"
            control={control}
            render={({ field }) => (
              <Combobox
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                placeholder="Cari penawaran..."
                options={filteredQuotations.map((q) => ({ value: String(q.id), label: q.documentNo }))}
              />
            )}
          />
          {errors.quotationId && <span className="text-xs text-danger mt-1">{errors.quotationId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah DP (Rp) *</Label>
          <Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" prefix="Rp" />} />
          {errors.amount && <span className="text-xs text-danger mt-1">{errors.amount.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Pembayaran"
            name="paymentDate"
            value={watch("paymentDate")}
            onChange={(val) => setValue("paymentDate", val)}
            required
          />
          {errors.paymentDate && <span className="text-xs text-danger mt-1">{errors.paymentDate.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentMethod">Metode Pembayaran *</Label>
          <Controller
            name="paymentMethod"
            control={control}
            render={({ field }) => (
              <Combobox
                id="paymentMethod"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pilih / ketik metode..."
                options={(paymentMethods.length > 0
                  ? paymentMethods
                  : [{ code: "transfer", name: "Transfer" }, { code: "cash", name: "Tunai" }]
                ).map((m) => ({ value: m.code, label: m.name }))}
              />
            )}
          />
          {errors.paymentMethod && <span className="text-xs text-danger mt-1">{errors.paymentMethod.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="proofImage">Bukti Pembayaran</Label>
          <input
            id="proofImage"
            type="file"
            accept="image/*"
            onChange={(e) => setProofFile(e.target.files?.[0] || null)}
            className="form-input"
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk uang muka ini..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-down-payment">
          {isPending ? "Menyimpan..." : downPayment?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
