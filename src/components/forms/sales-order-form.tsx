"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createSalesOrder, updateSalesOrder } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/page-header"

const salesOrderSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  deliveryDate: z.string().optional(),
  notes: z.string().optional(),
})

type SalesOrderInput = z.infer<typeof salesOrderSchema>

interface SalesOrderFormProps {
  customers: { id: number; name: string
}[]
  order?: { id: number; customerId: number; quotationId?: number | null; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number; discount?: number }> }
  quotationId?: number
  defaultCustomerId?: number
}

export function SalesOrderForm({ customers, order, quotationId: _quotationId, defaultCustomerId: _defaultCustomerId }: SalesOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesOrderInput>({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: {
      customerId: order?.customerId,
      date: order?.date ?? new Date().toISOString().split("T")[0],
      deliveryDate: "",
      notes: order?.notes ?? "",
    },
  })

  function onSubmit(data: SalesOrderInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") formData.append(key, String(value))
        })
        const result = order?.id ? await updateSalesOrder(order.id, formData) : await createSalesOrder(formData)
        if (result.success) {
          showSuccess(order?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push(`/penjualan/pesanan/${result.id}`)
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
            label="Tanggal Pengiriman"
            name="deliveryDate"
            value={watch("deliveryDate")}
            onChange={(val) => setValue("deliveryDate", val)}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk pesanan penjualan ini..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-sales-order">
          {isPending ? "Menyimpan..." : order?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
