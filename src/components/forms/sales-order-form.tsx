"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createSalesOrder, updateSalesOrder } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { TextArea, ComboBox, Input, ListBox, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

const salesOrderSchema = z.object({
  customerId: z.number({ error: "Customer wajib dipilih" }).min(1, "Customer wajib dipilih"),
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

export function SalesOrderForm({ customers, order, quotationId, defaultCustomerId }: SalesOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesOrderInput>({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      deliveryDate: "",
      notes: "",
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
          showSuccess(order?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
          router.push(`/sales/orders/${result.id}`)
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
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Customer *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari customer..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {customers.map((c) => (
                      <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>
                        {c.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
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
          <TextArea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk sales order ini..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onClick={() => router.back()} >Batal</Button>
        <Button disabled={isPending}  id="submit-sales-order">
          {isPending ? "Menyimpan..." : order?.id ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
