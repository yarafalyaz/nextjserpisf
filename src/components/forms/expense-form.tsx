"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { expenseSchema, type ExpenseInput } from "@/lib/validators"
import { createExpense, updateExpense } from "@/actions/finance.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormAttachmentUpload } from "@/components/ui/form-attachment-upload"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

interface ExpenseFormProps {
  accounts: { id: number; code: string; name: string; type: string }[]
  categories?: { id: number; name: string; label: string }[]
  costCenters?: { id: number; code: string; name: string }[]
  projects?: { id: number; name: string; documentNo: string | null }[]
  vendors?: { id: number; name: string }[]
  expense?: { id: number; date: string; description?: string | null; amount: number; accountId: number; paidFromAccountId?: number | null; categoryId?: number | null; costCenterId?: number | null; projectId?: number | null; vendorId?: number | null; referenceNo?: string | null; receiptImage?: string | null; notes?: string | null; status?: string }
}

export function ExpenseForm({ accounts, categories = [], costCenters = [], projects = [], vendors = [], expense }: ExpenseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE")
  const assetAccounts = accounts.filter((a) => a.type === "ASSET")
  const [expenseAccountOptions, setExpenseAccountOptions] = useState(expenseAccounts)
  const [assetAccountOptions, setAssetAccountOptions] = useState(assetAccounts)
  const [costCenterOptions, setCostCenterOptions] = useState(costCenters)
  const [vendorOptions, setVendorOptions] = useState(vendors)
  const [costCenterId, setCostCenterId] = useState<string | null>(expense?.costCenterId ? String(expense.costCenterId) : null)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<ExpenseInput>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expense ? {
      date: expense.date,
      amount: expense.amount,
      description: expense.description ?? "",
      categoryId: expense.categoryId ?? undefined,
      referenceNo: expense.referenceNo ?? "",
      receiptImage: expense.receiptImage ?? "",
      accountId: expense.accountId,
      paidFromAccountId: expense.paidFromAccountId ?? undefined,
      projectId: expense.projectId ?? undefined,
      vendorId: expense.vendorId ?? undefined,
    } : {
      date: toLocalDateOnly(new Date()),
      amount: 0,
      description: "",
      categoryId: undefined,
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
        // costCenterId is held in local state (not part of the RHF schema), so it
        // must be appended explicitly or the selected cost center is lost.
        if (costCenterId) formData.append("costCenterId", costCenterId)
        const result = expense?.id ? await updateExpense(expense.id, formData) : await createExpense(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(expense?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/pengeluaran")
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
              <>
                <Label htmlFor="accountId">Akun Beban *</Label>
                <QuickAddSelect
                  id="accountId"
                  options={expenseAccountOptions.map((acc) => ({ value: String(acc.id), label: acc.code ? `${acc.code} - ${acc.name}` : acc.name }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari akun beban..."
                  title={QUICK_ADD.account.title}
                  fields={QUICK_ADD.account.fields}
                  action={QUICK_ADD.account.action}
                  onCreated={(created) => {
                    setExpenseAccountOptions((prev) => [...prev, { id: created.id, code: "", name: created.label, type: "EXPENSE" }])
                    field.onChange(created.id)
                  }}
                />
              </>
            )}
          />
          {errors.accountId && <span className="text-xs text-danger mt-1">{errors.accountId.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="paidFromAccountId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="paidFromAccountId">Dibayar Dari</Label>
                <QuickAddSelect
                  id="paidFromAccountId"
                  options={assetAccountOptions.map((acc) => ({ value: String(acc.id), label: `${acc.code} - ${acc.name}` }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari akun kas/bank..."
                  title={QUICK_ADD.account.title}
                  fields={QUICK_ADD.account.fields}
                  action={QUICK_ADD.account.action}
                  onCreated={(created) => {
                    setAssetAccountOptions((prev) => [...prev, { id: created.id, code: "", name: created.label, type: "ASSET" }])
                    field.onChange(created.id)
                  }}
                />
              </>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="amount">Jumlah (Rp) *</Label>
          <Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" prefix="Rp" />} />
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
            name="categoryId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="categoryId">Kategori</Label>
                <Combobox
                  id="categoryId"
                  options={categories.map((cat) => ({ value: String(cat.id), label: cat.label }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari kategori..."
                />
              </>
            )}
          />
        </div>

        {costCenters.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="costCenterId">Pusat Biaya</Label>
            <QuickAddSelect
              id="costCenterId"
              name="costCenterId"
              options={costCenterOptions.map((cc) => ({ value: String(cc.id), label: cc.code ? `${cc.code} - ${cc.name}` : cc.name }))}
              value={costCenterId}
              onChange={setCostCenterId}
              placeholder="Cari pusat biaya..."
              title={QUICK_ADD.costCenter.title}
              fields={QUICK_ADD.costCenter.fields}
              action={QUICK_ADD.costCenter.action}
              onCreated={(created) => {
                setCostCenterOptions((prev) => [...prev, { id: created.id, code: "", name: created.label }])
                setCostCenterId(String(created.id))
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Controller
            name="projectId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="projectId">Nama Project</Label>
                <Combobox
                  id="projectId"
                  options={projects.map((p) => ({ value: String(p.id), label: `${p.documentNo ? `${p.documentNo} - ` : ""}${p.name}` }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari project..."
                />
              </>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="vendorId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="vendorId">Vendor</Label>
                <QuickAddSelect
                  id="vendorId"
                  options={vendorOptions.map((v) => ({ value: String(v.id), label: v.name }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari vendor/toko..."
                  title={QUICK_ADD.vendor.title}
                  fields={QUICK_ADD.vendor.fields}
                  action={QUICK_ADD.vendor.action}
                  onCreated={(created) => {
                    setVendorOptions((prev) => [...prev, { id: created.id, name: created.label }])
                    field.onChange(created.id)
                  }}
                />
              </>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referenceNo">No. Referensi</Label>
          <Input id="referenceNo" {...register("referenceNo")} placeholder="Nomor referensi..." />
        </div>

        <div className="flex flex-col gap-1.5 [&_section]:col-span-1">
          <FormAttachmentUpload referenceType="expense" />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" {...register("description")} rows={3} placeholder="Deskripsi pengeluaran..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}  id="submit-expense">
          {isPending ? "Menyimpan..." : expense?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
