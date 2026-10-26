"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createSalesOrder, updateSalesOrder } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { SalesCustomerFormShell } from "@/components/forms/sales-customer-form-shell"
import { CreditOverridePanel, type CreditGateBlockedState } from "@/components/forms/credit-override-panel"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { toLocalDateOnly } from "@/lib/utils/date-only"

const salesOrderSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  date: z.string().min(1, "Tanggal wajib diisi"),
  deliveryDate: z.string().optional(),
  // Tautan ke penawaran asal. Tidak ada inputnya, tetapi harus ikut terkirim —
  // tanpanya pesanan hasil konversi Penawaran kehilangan tautannya.
  quotationId: z.number().optional(),
  notes: z.string().optional(),
})

type SalesOrderInput = z.infer<typeof salesOrderSchema>

interface SalesOrderFormProps {
  customers: { id: number; name: string
}[]
  order?: { id: number; customerId: number; quotationId?: number | null; deliveryDate?: string | null; date: string; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number; discount?: number }> }
  quotationId?: number
  defaultCustomerId?: number
}

export function SalesOrderForm({ customers, order, quotationId, defaultCustomerId }: SalesOrderFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customerOptions, setCustomerOptions] = useState(customers)
  const [creditBlocked, setCreditBlocked] = useState<CreditGateBlockedState | null>(null)
  const [creditReason, setCreditReason] = useState("")
  const [creditReasonError, setCreditReasonError] = useState<string | undefined>()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesOrderInput>({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: {
      // `defaultCustomerId`/`quotationId` datang dari konversi Penawaran → Pesanan.
      // Sebelumnya keduanya diabaikan (prop di-prefix "_") sehingga pelanggan tidak
      // terisi dan tautan penawaran hilang. `deliveryDate` harus di-seed saat edit,
      // kalau tidak tanggal pengiriman terhapus setiap kali pesanan disimpan.
      customerId: order?.customerId ?? defaultCustomerId,
      quotationId: order?.quotationId ?? quotationId,
      date: order?.date ?? toLocalDateOnly(new Date()),
      deliveryDate: order?.deliveryDate ?? "",
      notes: order?.notes ?? "",
    },
  })

  function onSubmit(data: SalesOrderInput) {
    // Alasan wajib HANYA saat percobaan tertahan sebelumnya tanpa rekod:
    // simpan ulang identik + alasan supaya server memersist permintaan.
    if (creditBlocked && creditBlocked.creditOverrideId == null && !creditReason.trim()) {
      setCreditReasonError("Alasan permintaan override wajib diisi")
      return
    }
    setCreditReasonError(undefined)
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") formData.append(key, String(value))
        })
        if (creditReason.trim()) formData.append("creditOverrideReason", creditReason.trim())
        const result = order?.id ? await updateSalesOrder(order.id, formData) : await createSalesOrder(formData)
        if (result.success) {
          setCreditBlocked(null)
          showSuccess(order?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push(`/penjualan/pesanan/${result.slug ?? result.id}`)
          router.refresh()
        } else if ("creditStatusLabel" in result && typeof result.creditStatusLabel === "string") {
          // Tertahan gerbang kredit: tampilkan payload server verbatim di panel.
          const b = result as unknown as CreditGateBlockedState & { error: string }
          setCreditBlocked({ ...b, creditOverrideId: b.creditOverrideId ?? null })
          showError(b.error)
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <SalesCustomerFormShell
      onSubmit={handleSubmit(onSubmit)}
      control={control}
      name="customerId"
      options={customerOptions}
      onCustomerCreated={(created) => setCustomerOptions((prev) => [...prev, created])}
      error={errors.customerId?.message}
      submitId="submit-sales-order"
      isPending={isPending}
      isEditing={Boolean(order?.id)}
      formLabel={order?.id ? "Formulir ubah pesanan" : "Formulir tambah pesanan"}
      creditGatePanel={creditBlocked ? (
        <CreditOverridePanel
          blocked={creditBlocked}
          reason={creditReason}
          onReasonChange={setCreditReason}
          reasonError={creditReasonError}
        />
      ) : undefined}
    >

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
    </SalesCustomerFormShell>
  )
}
