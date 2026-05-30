"use client"

import { useRouter } from "next/navigation"
import { useTransition, type BaseSyntheticEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { salesPaymentSchema, type SalesPaymentInput } from "@/lib/validators"
import { createSalesPayment, updateSalesPayment } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Select, ComboBox, ListBox, Label, InputGroup } from "@heroui/react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface PaymentFormProps {
  invoices: { id: number; documentNo: string; grandTotal: string; paidAmount: string; customer: { name: string } }[]
  accounts: { id: number; code: string; name: string }[]
  defaultInvoiceId?: number
  payment?: { id: number }
}

export function PaymentForm({ invoices, accounts, defaultInvoiceId, payment }: PaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesPaymentInput>({
    resolver: zodResolver(salesPaymentSchema),
    defaultValues: {
      salesInvoiceId: defaultInvoiceId || undefined,
      amount: defaultInvoiceId
        ? Number(invoices.find(i => i.id === defaultInvoiceId)?.grandTotal ?? 0) - Number(invoices.find(i => i.id === defaultInvoiceId)?.paidAmount ?? 0)
        : 0,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "transfer",
      notes: "",
    },
  })

  const selectedInvoiceId = watch("salesInvoiceId")
  const selectedInvoice = invoices.find((i) => i.id === Number(selectedInvoiceId))
  const remaining = selectedInvoice ? Number(selectedInvoice.grandTotal) - Number(selectedInvoice.paidAmount) : 0

  function onSubmit(data: SalesPaymentInput, event?: BaseSyntheticEvent) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        const nativeFormData = new FormData(event?.target)
        const attachmentIdsValue = nativeFormData.get("attachmentIds")
        if (attachmentIdsValue) formData.append("attachmentIds", attachmentIdsValue as string)
        if (payment?.id) {

          await updateSalesPayment(payment.id, formData)

        } else {

          await createSalesPayment(formData)

        }
        showSuccess(payment?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/penjualan/pembayaran")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Umum">
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
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah Bayar (Rp) *</Label>
            <InputGroup>
              <InputGroup.Prefix>Rp</InputGroup.Prefix>
              <Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />} />
            </InputGroup>
            {errors.amount && <span className="text-xs text-danger mt-1">{errors.amount.message}</span>}
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
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <TextArea id="notes" {...register("notes")} rows={2} placeholder="Catatan pembayaran..." />
          </div>
          <FormAttachmentUpload referenceType="sales_payment" />
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Memproses..." : "Terima Pembayaran"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
