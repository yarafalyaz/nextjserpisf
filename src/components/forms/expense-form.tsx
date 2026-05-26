"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { expenseSchema, type ExpenseInput } from "@/lib/validators"
import { createExpense, updateExpense } from "@/actions/finance.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import {Select, ComboBox, ListBox, Label, InputGroup , Select as HeroSelect} from "@heroui/react"
import { SelectValue, SelectLabel, Input, TextArea } from "@/components/ui/heroui-compat"
import { CurrencyInput } from "@/components/ui/currency-input"

interface ExpenseFormProps {
  accounts: { id: number; code: string; name: string; type: string }[]
  costCenters?: { id: number; code: string; name: string }[]
  projects?: { id: number; name: string; documentNo: string | null }[]
  expense?: { id: number; date: string; description?: string | null; amount: number; accountId: number; costCenterId?: number | null; projectId?: number | null; referenceNo?: string | null; receiptImage?: string | null; notes?: string | null; status?: string }
}

export function ExpenseForm({ accounts, costCenters = [], projects = [], expense }: ExpenseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const assetAccounts = accounts.filter((a) => a.type === "ASSET")

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      description: "",
      category: "",
      referenceNo: "",
      receiptImage: "",
    }})

  function onSubmit(data: ExpenseInput, event?: React.BaseSyntheticEvent) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        const nativeFormData = new FormData(event?.target)
        const attachmentIdsValue = nativeFormData.get("attachmentIds")
        if (attachmentIdsValue) formData.append("attachmentIds", attachmentIdsValue as string)
        expense?.id ? await updateExpense(expense.id, formData) : await createExpense(formData)
        showSuccess(expense?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/finance/expenses")
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
            name="accountId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Akun Beban *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari akun beban..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {expenseAccounts.map((acc) => (
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
          {errors.accountId && <span className="text-xs text-danger mt-1">{errors.accountId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="paidFromAccountId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Dibayar Dari</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari akun kas/bank..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {assetAccounts.map((acc) => (
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

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" />} />
          </InputGroup>
          {errors.amount && <span className="text-xs text-danger mt-1">{errors.amount.message}</span>}
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
          <Controller
            name="category"
            control={control}
            render={({ field }) => (
              <Select selectedKey={field.value || null} onSelectionChange={(key) => field.onChange(key ? String(key) : "")} className="w-full">
                <Label>Kategori</Label>
                <HeroSelect.Trigger><SelectValue placeholder="Pilih Kategori" /><HeroSelect.Indicator /></HeroSelect.Trigger>
                <HeroSelect.Popover>
                  <ListBox>
                    <ListBox.Item id="operasional" textValue="Operasional">Operasional<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="transportasi" textValue="Transportasi">Transportasi<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="makan" textValue="Makan & Minum">Makan & Minum<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="utilitas" textValue="Utilitas">Utilitas<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="marketing" textValue="Marketing">Marketing<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="maintenance" textValue="Maintenance">Maintenance<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="lainnya" textValue="Lainnya">Lainnya<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </HeroSelect.Popover>
              </Select>
            )}
          />
        </div>

        {costCenters.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <ComboBox
              name="costCenterId"
              defaultSelectedKey={expense?.costCenterId ? String(expense.costCenterId) : undefined}
              className="w-full"
            >
              <Label>Cost Center</Label>
              <ComboBox.InputGroup><Input placeholder="Cari cost center..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {costCenters.map((cc) => (
                    <ListBox.Item key={cc.id} id={String(cc.id)} textValue={`${cc.code} - ${cc.name}`}>
                      {cc.code} - {cc.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Controller
            name="projectId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Proyek</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari proyek..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {projects.map((p) => (
                      <ListBox.Item key={p.id} id={String(p.id)} textValue={`${p.documentNo || ''} - ${p.name}`}>
                        {p.documentNo ? `${p.documentNo} - ` : ""}{p.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referenceNo">No. Referensi</Label>
          <Input id="referenceNo" {...register("referenceNo")} placeholder="Nomor referensi..." />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="receiptImage">Bukti / Kwitansi (URL)</Label>
          <Input id="receiptImage" {...register("receiptImage")} placeholder="URL gambar bukti..." />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <TextArea id="description" {...register("description")} rows={3} placeholder="Deskripsi pengeluaran..." />
        </div>
      </div>

      <FormAttachmentUpload referenceType="expense" />
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-expense">
          {isPending ? "Menyimpan..." : expense?.id ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
