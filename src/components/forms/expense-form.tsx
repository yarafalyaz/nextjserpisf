"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { expenseSchema, type ExpenseInput } from "@/lib/validations/form.schemas"
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
import { FormGrid, FormGroup } from "@/components/ui/form-layout"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import {
  LateCostL3Field,
  parseL3TagClient,
  upsertL3Tag,
  removeL3Tag,
} from "./late-cost-l3-field"

// P2 idempotency UI: generator key murni di luar render (pola customer-credit-panel).
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

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
  // P2 idempotency UI: satu key stabil per submit create (crypto.randomUUID per
  // submit). Retry/error pakai key sama; sukses ganti key baru.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

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

  // L3 (F-133-V): penanda hidup di baris pertama description; field
  // terstruktur di bawah hanya menulis/menghapus baris itu lewat setValue,
  // server pemilik vonis akhir.
  const descriptionValue = watch("description") ?? ""
  const initialL3 = parseL3TagClient(expense?.description)
  const [l3Enabled, setL3Enabled] = useState(Boolean(initialL3))
  const [l3WorkOrderNo, setL3WorkOrderNo] = useState(initialL3?.workOrderNo ?? "")
  const [l3Reason, setL3Reason] = useState(initialL3?.reason ?? "")

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
        // P2 idempotency UI: key stabil per intent create; retry/error pakai
        // key sama, sukses ganti baru supaya create berikutnya tak ditolak.
        if (!expense?.id) formData.set("idempotencyKey", idempotencyKeyRef.current)
        const result = expense?.id ? await updateExpense(expense.id, formData) : await createExpense(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        if (!expense?.id) idempotencyKeyRef.current = newIdempotencyKey()
        showSuccess(expense?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/keuangan/pengeluaran")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} aria-busy={isPending} aria-label={expense?.id ? "Formulir ubah pengeluaran" : "Formulir tambah pengeluaran"} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <FormGrid>
        <FormGroup>
          <Controller
            name="accountId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="accountId">Akun Beban <span className="text-destructive" aria-hidden="true">*</span></Label>
                <QuickAddSelect
                  id="accountId"
                  required
                  aria-describedby={errors.accountId ? "accountId-error" : undefined}
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
          {errors.accountId && <span id="accountId-error" role="alert" className="text-xs text-danger mt-1">{errors.accountId.message}</span>}
        </FormGroup>

        <FormGroup>
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
        </FormGroup>

        <FormGroup>
          <Label htmlFor="amount">Jumlah (Rp) <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Controller name="amount" control={control} render={({ field }) => <CurrencyInput id="amount" required aria-describedby={errors.amount ? "amount-error" : undefined} value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" prefix="Rp" />} />
          {errors.amount && <span id="amount-error" role="alert" className="text-xs text-danger mt-1">{errors.amount.message}</span>}
        </FormGroup>

        <FormGroup>
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={watch("date")}
            onChange={(val) => setValue("date", val)}
            required
          />
          {errors.date && <span role="alert" className="text-xs text-danger mt-1">{errors.date.message}</span>}
        </FormGroup>

        <FormGroup>
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
        </FormGroup>

        {costCenters.length > 0 && (
          <FormGroup>
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
          </FormGroup>
        )}

        <FormGroup>
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
        </FormGroup>

        <FormGroup>
          <Controller
            name="vendorId"
            control={control}
            render={({ field }) => (
              <>
                <Label htmlFor="vendorId">Pemasok</Label>
                <QuickAddSelect
                  id="vendorId"
                  options={vendorOptions.map((v) => ({ value: String(v.id), label: v.name }))}
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                  placeholder="Cari pemasok/toko..."
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
        </FormGroup>

        <FormGroup>
          <Label htmlFor="referenceNo">No. Referensi</Label>
          <Input id="referenceNo" {...register("referenceNo")} placeholder="Nomor referensi..." />
        </FormGroup>

        <FormGroup className="[&_section]:col-span-1">
          <FormAttachmentUpload referenceType="expense" />
        </FormGroup>

        <FormGroup full>
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" {...register("description")} rows={3} placeholder="Deskripsi pengeluaran..." />
          <p className="text-xs text-muted-foreground">
            Baris penanda L3 dikelola lewat isian di bawah; jangan ketik atau ubah frasa penanda dengan tangan.
          </p>
        </FormGroup>

        <FormGroup full>
          <LateCostL3Field
            idPrefix="description"
            enabled={l3Enabled}
            onEnabledChange={(enabled) => {
              setL3Enabled(enabled)
              setValue(
                "description",
                enabled
                  ? upsertL3Tag(descriptionValue, l3WorkOrderNo, l3Reason)
                  : removeL3Tag(descriptionValue),
                { shouldDirty: true },
              )
            }}
            workOrderNo={l3WorkOrderNo}
            onWorkOrderNoChange={(value) => {
              setL3WorkOrderNo(value)
              setValue("description", upsertL3Tag(descriptionValue, value, l3Reason), { shouldDirty: true })
            }}
            reason={l3Reason}
            onReasonChange={(value) => {
              setL3Reason(value)
              setValue("description", upsertL3Tag(descriptionValue, l3WorkOrderNo, value), { shouldDirty: true })
            }}
          />
        </FormGroup>
      </FormGrid>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}  id="submit-expense">
          {isPending ? "Menyimpan..." : expense?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
