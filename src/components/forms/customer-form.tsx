"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { customerSchema, type CustomerInput } from "@/lib/validators"
import { createCustomer, updateCustomer } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { CurrencyInput } from "@/components/ui/currency-input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

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
    creditLimit?: number | string | null
  }
  generatedCode?: string
  enableAutoCode?: boolean
}

export function CustomerForm({ customer, generatedCode, enableAutoCode = true }: CustomerFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!customer

  const { register, handleSubmit, control, formState: { errors } } = useForm<CustomerInput>({
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
      creditLimit: customer?.creditLimit != null ? Number(customer.creditLimit) : 0,
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

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode Pelanggan</Label>
            <Input id="code" {...register("code")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} />
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
            <Label htmlFor="creditLimit">Batas Kredit (Rp)</Label>
            <Controller
              name="creditLimit"
              control={control}
              render={({ field }) => (
                <CurrencyInput id="creditLimit" value={field.value} onChange={field.onChange} onBlur={field.onBlur} min={0} prefix="Rp" placeholder="0 = tanpa batas" />
              )}
            />
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
  )
}
