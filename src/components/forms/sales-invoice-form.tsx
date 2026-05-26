// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createSalesInvoice, updateSalesInvoice } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

const salesInvoiceSchema = z.object({
  customerId: z.number({ required_error: "Customer wajib dipilih" }).min(1, "Customer wajib dipilih"),
  salesOrderId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
})

type SalesInvoiceInput = z.infer<typeof salesInvoiceSchema>

interface SalesInvoiceFormProps {
  customers: { id: number; name: string
}[]
  invoice?: any
  salesOrders: { id: number; documentNo: string }[]
}

export function SalesInvoiceForm({ customers, salesOrders, invoice }: SalesInvoiceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesInvoiceInput>({
    resolver: zodResolver(salesInvoiceSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      dueDate: "",
      notes: "",
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
          showSuccess(invoice?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push(`/sales/invoices/${result.id}`)
          router.refresh()
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
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <ComboBox selectedKey={field.value ? String(field.value) : null} onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)} className="w-full">
                <Label>Customer *</Label>
                <ComboBox.InputGroup><Input placeholder="Cari customer..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {customers.map((c) => (
                      <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>{c.name}</ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
          {errors.customerId && <span className="text-xs text-danger mt-1">{errors.customerId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="salesOrderId"
            control={control}
            render={({ field }) => (
              <ComboBox selectedKey={field.value ? String(field.value) : null} onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)} className="w-full">
                <Label>Sales Order (Opsional)</Label>
                <ComboBox.InputGroup><Input placeholder="Cari sales order..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {salesOrders.map((so) => (
                      <ListBox.Item key={so.id} id={String(so.id)} textValue={so.documentNo}>{so.documentNo}</ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
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
          <TextArea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk invoice ini..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-sales-invoice">
          {isPending ? "Menyimpan..." : invoice?.id ? "Update" : "Simpan"}
        </button>
      </div>

      <p className="text-muted" style={{ marginTop: "12px", fontSize: "0.8125rem" }}>
        Setelah invoice dibuat, Anda bisa menambahkan item di halaman detail.
      </p>
    </form>
  )
}
