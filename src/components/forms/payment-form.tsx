// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { salesPaymentSchema, type SalesPaymentInput } from "@/lib/validators"
import { createSalesPayment, updateSalesPayment } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label, InputGroup } from "@heroui/react"

interface PaymentFormProps {
  invoices: { id: number; documentNo: string; grandTotal: string; paidAmount: string; customer: { name: string } }[]
  accounts: { id: number; code: string; name: string }[]
  defaultInvoiceId?: number
  payment?: any
}

export function PaymentForm({ invoices, accounts, defaultInvoiceId, payment }: PaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm({
    resolver: zodResolver(salesPaymentSchema),
    defaultValues: {
      salesInvoiceId: defaultInvoiceId || undefined,
      amount: 0,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "transfer",
      notes: "",
    },
  })

  const selectedInvoiceId = watch("salesInvoiceId")
  const selectedInvoice = invoices.find((i) => i.id === Number(selectedInvoiceId))
  const remaining = selectedInvoice ? Number(selectedInvoice.grandTotal) - Number(selectedInvoice.paidAmount) : 0

  function onSubmit(data: any, event?: React.BaseSyntheticEvent) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        const nativeFormData = new FormData(event?.target)
        const attachmentIdsValue = nativeFormData.get("attachmentIds")
        if (attachmentIdsValue) formData.append("attachmentIds", attachmentIdsValue as string)
        payment?.id ? await updateSalesPayment(payment.id, formData) : await createSalesPayment(formData)
        showSuccess(payment?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/sales/payments")
        router.refresh()
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
            name="salesInvoiceId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Invoice *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari invoice..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {invoices.map((inv) => (
                      <ListBox.Item key={inv.id} id={String(inv.id)} textValue={`${inv.documentNo} - ${inv.customer.name}`}>
                        {inv.documentNo} - {inv.customer.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
          {errors.salesInvoiceId && <span className="text-xs text-danger mt-1">{errors.salesInvoiceId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Sisa Tagihan</Label>
          <div className="form-input" style={{ background: "var(--bg-tertiary)", fontWeight: 600, color: remaining > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
            {selectedInvoice ? `Rp ${remaining.toLocaleString("id-ID")}` : "-"}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah Bayar (Rp) *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <InputGroup.Input id="amount" type="number" step="0.01" {...register("amount", { valueAsNumber: true })} placeholder="0" />
          </InputGroup>
          {errors.amount && <span className="text-xs text-danger mt-1">{errors.amount.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Bayar"
            name="paymentDate"
            value={watch("paymentDate")}
            onChange={(val) => setValue("paymentDate", val)}
            required
          />
          {errors.paymentDate && <span className="text-xs text-danger mt-1">{errors.paymentDate.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="paymentMethod"
            control={control}
            render={({ field }) => (
              <Select selectedKey={field.value || null} onSelectionChange={(key) => field.onChange(key ? String(key) : "")} className="w-full">
                <Label>Metode Bayar *</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="transfer" textValue="Transfer Bank">Transfer Bank<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="cash" textValue="Tunai">Tunai<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="check" textValue="Cek/Giro">Cek/Giro<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="card" textValue="Kartu Kredit/Debit">Kartu Kredit/Debit<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="ewallet" textValue="E-Wallet">E-Wallet<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
          {errors.paymentMethod && <span className="text-xs text-danger mt-1">{errors.paymentMethod.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Akun Kas/Bank</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari akun..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {accounts.map((acc) => (
                      <ListBox.Item key={acc.id} id={String(acc.id)} textValue={`${acc.code} - ${acc.name}`}>
                        {acc.code} - {acc.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" {...register("notes")} rows={2} placeholder="Catatan pembayaran..." />
        </div>
      </div>

      <FormAttachmentUpload referenceType="sales_payment" />
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-payment">
          {isPending ? "Memproses..." : "Terima Pembayaran"}
        </button>
      </div>
    </form>
  )
}
