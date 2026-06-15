"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createSalesInvoice, updateSalesInvoice } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"

const salesInvoiceSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  salesOrderId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
})

type SalesInvoiceInput = z.infer<typeof salesInvoiceSchema>

interface SalesInvoiceFormProps {
  customers: { id: number; name: string
}[]
  invoice?: { id: number; customerId: number; salesOrderId?: number | null; date: string; dueDate?: string | null; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number; discount?: number }> }
  salesOrders: { id: number; documentNo: string }[]
}

export function SalesInvoiceForm({ customers, salesOrders, invoice }: SalesInvoiceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesInvoiceInput>({
    resolver: zodResolver(salesInvoiceSchema),
    defaultValues: {
      customerId: invoice?.customerId,
      salesOrderId: invoice?.salesOrderId ?? undefined,
      date: invoice?.date ?? new Date().toISOString().split("T")[0],
      dueDate: invoice?.dueDate ?? "",
      notes: invoice?.notes ?? "",
    },
  })

  function onSubmit(data: SalesInvoiceInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") formData.append(key, String(value))
        })
        const result = invoice?.id ? await updateSalesInvoice(invoice.id, formData) : await createSalesInvoice(formData)
        if (result.success) {
          showSuccess(invoice?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push(`/penjualan/faktur/${result.id}`)
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
          <Label htmlFor="customerId">Pelanggan *</Label>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <Combobox
                id="customerId"
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
          <Label htmlFor="salesOrderId">Pesanan Penjualan (Opsional)</Label>
          <Controller
            name="salesOrderId"
            control={control}
            render={({ field }) => (
              <Combobox
                id="salesOrderId"
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                placeholder="Cari pesanan penjualan..."
                options={salesOrders.map((so) => ({ value: String(so.id), label: so.documentNo }))}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={watch("date")}
            onChange={(val) => setValue("date", val)}
            required
          />
          {errors.date && <span className="text-xs text-danger mt-1">{errors.date.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Jatuh Tempo"
            name="dueDate"
            value={watch("dueDate")}
            onChange={(val) => setValue("dueDate", val)}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk faktur ini..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-sales-invoice">
          {isPending ? "Menyimpan..." : invoice?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>

      <p className="text-muted-foreground" style={{ marginTop: "12px", fontSize: "0.8125rem" }}>
        Setelah faktur dibuat, Anda bisa menambahkan item di halaman detail.
      </p>
    </form>
  )
}
