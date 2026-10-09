"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState, type FormEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { customerSchema, type CustomerInput } from "@/lib/validators"
import { createCustomer, updateCustomer, createCustomerCategory } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog"

interface CustomerFormProps {
  customer?: {
    id: number
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    province: string | null
    district: string | null
    village: string | null
    postalCode: string | null
    contactPerson: string | null
    gender: string | null
    code: string | null
    taxId?: string | null
    customerCategoryId?: number | null
  }
  generatedCode?: string
  enableAutoCode?: boolean
  categories?: { id: number; name: string }[]
}

export function CustomerForm({ customer, generatedCode, enableAutoCode = true, categories = [] }: CustomerFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!customer

  // Quick-add state for "Kategori Pelanggan": the option list is local so a
  // newly created category appears (and gets selected) without a page reload.
  const [categoryOptions, setCategoryOptions] = useState(categories)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [quickAddName, setQuickAddName] = useState("")
  const [quickAddPending, startQuickAdd] = useTransition()

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      address: customer?.address || "",
      city: customer?.city || "",
      contactPerson: customer?.contactPerson || "",
      gender: customer?.gender || "",
      code: customer?.code || (enableAutoCode ? generatedCode : "") || "",
      taxId: customer?.taxId || "",
      customerCategoryId: customer?.customerCategoryId ?? null,
    },
  })

  function onSubmit(data: CustomerInput, event?: React.BaseSyntheticEvent) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        // Append/overwrite address fields from AddressPicker hidden inputs
        const form = event?.target as HTMLFormElement | null
        if (form) {
          const addressFields = ["province", "city", "district", "village", "postalCode", "address"]
          addressFields.forEach(field => {
            const input = form.querySelector(`input[name="${field}"]`) as HTMLInputElement | null
            if (input?.value) {
              formData.set(field, input.value)
            }
          })
        }
        const result = isEdit ? await updateCustomer(customer!.id, formData) : await createCustomer(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/pelanggan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  /**
   * Creates a customer category inline and selects it on the customer being
   * edited. The action returns the new id, so the fresh option can be appended
   * and chosen without a round-trip through the kategori-pelanggan page.
   */
  function onQuickAddCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    startQuickAdd(async () => {
      try {
        const result = await createCustomerCategory(formData)
        if (!result || !result.success || !result.id) {
          showError(result?.error || "Gagal menambah kategori pelanggan")
          return
        }
        const name = String(formData.get("name") ?? "").trim()
        setCategoryOptions((prev) => [...prev, { id: result.id!, name }])
        setValue("customerCategoryId", result.id, { shouldValidate: true })
        showSuccess("Kategori pelanggan berhasil ditambahkan")
        setQuickAddOpen(false)
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menambah kategori pelanggan")
      }
    })
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <FormCard>
          <FormSection title="Informasi Umum">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Kode Pelanggan</Label>
              <Input id="code" {...register("code")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Kategori Pelanggan</Label>
              <Controller
                name="customerCategoryId"
                control={control}
                render={({ field }) => (
                  <Combobox
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : null)}
                    placeholder="Pilih kategori..."
                    options={categoryOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                    onCreateNew={(search) => {
                      setQuickAddName(search)
                      setQuickAddOpen(true)
                    }}
                  />
                )}
              />
              {errors.customerCategoryId && <span className="text-xs text-danger mt-1">{errors.customerCategoryId.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nama Pelanggan *</Label>
              <Input id="name" {...register("name")} placeholder="Nama lengkap" />
              {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="email@customer.com" />
              {errors.email && <span className="text-xs text-danger mt-1">{errors.email.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telepon *</Label>
              <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-() ]/g, "") }} placeholder="08xxxxxxxxxx" />
              {errors.phone && <span className="text-xs text-danger mt-1">{errors.phone.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxId">NPWP</Label>
              <Input id="taxId" {...register("taxId")} placeholder="Nomor Pokok Wajib Pajak" />
              {errors.taxId && <span className="text-xs text-danger mt-1">{errors.taxId.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Controller
                name="gender"
                control={control}
                render={({ field }) => (
                  <>
                    <Label>Jenis Kelamin</Label>
                    <RadioGroup value={field.value ? String(field.value) : ""} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2 pt-1.5">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="male" /> Laki-laki
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <RadioGroupItem value="female" /> Perempuan
                      </label>
                    </RadioGroup>
                  </>
                )}
              />
            </div>
          </FormSection>
          <FormSection title="Alamat" columns={1}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="street">Alamat Jalan</Label>
              <Textarea id="street" {...register("address")} rows={2} placeholder="Alamat jalan lengkap" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <AddressPicker defaultValues={{ province: customer?.province ?? undefined, city: customer?.city ?? undefined, district: customer?.district ?? undefined, village: customer?.village ?? undefined, postalCode: customer?.postalCode ?? undefined }} />
            </div>
          </FormSection>
          <FormActions>
            <Button type="button" onPress={() => router.back()}>Batal</Button>
            <Button type="submit" variant="primary" isDisabled={isPending} id="submit-customer">
              {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
            </Button>
          </FormActions>
        </FormCard>
      </form>

      {/* Quick-add lives OUTSIDE the customer <form>: nesting <form> is invalid
          HTML and would make the dialog's submit bubble into the customer save. */}
      <Dialog open={quickAddOpen} onOpenChange={(next) => { if (!quickAddPending) setQuickAddOpen(next) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Kategori Pelanggan</DialogTitle>
            <DialogDescription>
              Kategori baru langsung dipilih pada pelanggan ini setelah disimpan.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onQuickAddCategory} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quickAddCategoryName">Nama Kategori *</Label>
              <Input
                id="quickAddCategoryName"
                name="name"
                placeholder="mis. DP 20%"
                required
                defaultValue={quickAddName}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quickAddCategoryDp">Persentase Uang Muka (DP) (%) *</Label>
              <Input
                id="quickAddCategoryDp"
                name="downPaymentPercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                required
                defaultValue="0"
              />
            </div>
            <DialogFooter>
              <Button type="button" onPress={() => setQuickAddOpen(false)} isDisabled={quickAddPending}>
                Batal
              </Button>
              <Button type="submit" variant="primary" isDisabled={quickAddPending} id="submit-quick-category">
                {quickAddPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
