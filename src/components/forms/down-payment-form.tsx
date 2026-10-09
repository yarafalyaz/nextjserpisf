"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useState, useTransition, useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createDownPayment, updateDownPayment } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

const downPaymentSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  quotationId: z.number({ error: "Penawaran wajib dipilih" }).min(1, "Penawaran wajib dipilih"),
  amount: z.number({ error: "Jumlah wajib diisi" }).min(1, "Jumlah harus lebih dari 0"),
  paymentDate: z.string().min(1, "Tanggal pembayaran wajib diisi"),
  paymentMethod: z.string().min(1, "Metode pembayaran wajib dipilih"),
  notes: z.string().optional()})

type DownPaymentInput = z.infer<typeof downPaymentSchema>

interface DownPaymentFormProps {
  customers: { id: number; name: string; customerCategory?: { downPaymentPercent: number } | null }[]
  downPayment?: { id: number; customerId: number; amount: number; date: string; accountId?: number | null; notes?: string | null; salesOrderId?: number | null; quotationId?: number | null }
  quotations: {
    id: number
    documentNo: string
    customerId: number
    grandTotal?: number
    sections?: {
      id: number
      name: string
      items: {
        id: number
        description: string | null
        qty: number
        uom: string | null
        unitPrice: number
        total: number
      }[]
    }[]
  }[]
  defaultQuotationId?: number
  defaultCustomerId?: number
  paymentMethods?: { code: string; name: string }[]
}

export function DownPaymentForm({ customers, quotations, downPayment, defaultQuotationId: _defaultQuotationId, defaultCustomerId: _defaultCustomerId, paymentMethods = [] }: DownPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [customerOptions, setCustomerOptions] = useState(customers)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<DownPaymentInput>({
    resolver: zodResolver(downPaymentSchema),
    defaultValues: {
      customerId: downPayment?.customerId ?? _defaultCustomerId,
      quotationId: downPayment?.quotationId ?? _defaultQuotationId ?? undefined,
      amount: downPayment?.amount,
      paymentDate: downPayment?.date ?? toLocalDateOnly(new Date()),
      paymentMethod: "",
      notes: downPayment?.notes ?? ""}})

  const selectedCustomerId = watch("customerId")
  const selectedQuotationId = watch("quotationId")

  const filteredQuotations = quotations.filter(
    (q) => !selectedCustomerId || q.customerId === selectedCustomerId
  )

  useEffect(() => {
    if (!downPayment && selectedCustomerId && selectedQuotationId) {
      const customer = customers.find((c) => c.id === selectedCustomerId)
      const quo = quotations.find((q) => q.id === selectedQuotationId)
      if (customer && quo) {
        const dpPercent = Number(customer.customerCategory?.downPaymentPercent ?? 0)
        if (dpPercent > 0) {
          const calculatedDp = Math.round(Number(quo.grandTotal || 0) * (dpPercent / 100))
          setValue("amount", calculatedDp)
        }
      }
    }
  }, [selectedCustomerId, selectedQuotationId, customers, quotations, setValue, downPayment])

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
              <QuickAddSelect
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                placeholder="Cari pelanggan..."
                options={customerOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                title={QUICK_ADD.customer.title}
                fields={QUICK_ADD.customer.fields}
                action={QUICK_ADD.customer.action}
                onCreated={(created) => {
                  setCustomerOptions((prev) => [...prev, { id: created.id, name: created.label }])
                  field.onChange(created.id)
                }}
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

        {/* Detail Penawaran Preview */}
        {selectedQuotationId && (() => {
          const quo = quotations.find((q) => q.id === selectedQuotationId)
          if (!quo) return null
          
          const customer = customers.find((c) => c.id === selectedCustomerId)
          const dpPercent = Number(customer?.customerCategory?.downPaymentPercent ?? 0)

          return (
            <div className="col-span-full bg-default/10 rounded-xl border border-default p-5 flex flex-col gap-4">
              <div className="flex flex-wrap justify-between items-center gap-3 pb-3 border-b border-default">
                <div>
                  <h4 className="font-semibold text-foreground text-sm">Ringkasan Penawaran</h4>
                  <p className="text-xs text-muted-foreground">{quo.documentNo}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Total Penawaran:</span>
                  <p className="text-base font-bold text-primary">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(quo.grandTotal || 0)}
                  </p>
                </div>
              </div>

              {/* Item List */}
              {quo.sections && quo.sections.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h5 className="font-medium text-foreground text-xs">Daftar Item:</h5>
                  <div className="max-h-60 overflow-y-auto border border-default rounded-lg bg-surface">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-default/20 border-b border-default text-muted-foreground font-medium">
                          <th className="p-2 pl-3">Deskripsi</th>
                          <th className="p-2 text-right">Jumlah</th>
                          <th className="p-2">Satuan</th>
                          <th className="p-2 text-right">Harga Satuan</th>
                          <th className="p-2 text-right pr-3">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default">
                        {quo.sections.flatMap((s) => s.items).map((item) => (
                          <tr key={item.id} className="hover:bg-default/5">
                            <td className="p-2 pl-3 font-medium text-foreground">{item.description || "-"}</td>
                            <td className="p-2 text-right">{item.qty}</td>
                            <td className="p-2">{item.uom || "-"}</td>
                            <td className="p-2 text-right">
                              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.unitPrice)}
                            </td>
                            <td className="p-2 text-right font-medium pr-3">
                              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* DP Info */}
              {dpPercent > 0 && (
                <div className="bg-primary/5 rounded-lg border border-primary/20 p-3 text-xs text-primary flex items-center justify-between">
                  <span>Kategori Pelanggan menetapkan uang muka default sebesar <strong>{dpPercent}%</strong></span>
                  <span className="font-semibold">
                    Default DP: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Math.round((quo.grandTotal || 0) * (dpPercent / 100)))}
                  </span>
                </div>
              )}
            </div>
          )
        })()}

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
