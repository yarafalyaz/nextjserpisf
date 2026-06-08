"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { vendorSchema, type VendorInput } from "@/lib/validators"
import { createVendor, updateVendor } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface VendorFormProps {
  vendor?: {
    id: number
    code: string | null
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    province: string | null
    districtVendor: string | null
    villageVendor: string | null
    postalCode: string | null
    npwp: string | null
    contactPerson: string | null
    paymentTermId: number | null
  }
  generatedCode?: string
  enableAutoCode?: boolean
  paymentTerms?: { id: number; name: string }[]
}

export function VendorForm({ vendor, generatedCode, enableAutoCode = true, paymentTerms = [] }: VendorFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!vendor

  const { register, handleSubmit, control, formState: { errors } } = useForm<VendorInput>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      code: vendor?.code || (enableAutoCode ? generatedCode : "") || "",
      name: vendor?.name || "",
      email: vendor?.email || "",
      phone: vendor?.phone || "",
      address: vendor?.address || "",
      city: vendor?.city || "",
      npwp: vendor?.npwp || "",
      paymentTermId: vendor?.paymentTermId || undefined}})

  function onSubmit(data: VendorInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        // Append/overwrite address fields from AddressPicker hidden inputs
        const form = document.querySelector("form") as HTMLFormElement | null
        if (form) {
          const addressFields = ["province", "city", "district", "village", "postalCode", "address"]
          addressFields.forEach(field => {
            const input = form.querySelector(`input[name="${field}"]`) as HTMLInputElement | null
            if (input?.value) {
              formData.set(field, input.value)
            }
          })
        }

        if (isEdit) {
          await updateVendor(vendor!.id, formData)
        } else {
          await createVendor(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/pemasok")
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
            <Label htmlFor="code">ID Pemasok</Label>
            <Input id="code" {...register("code")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Pemasok *</Label>
            <Input id="name" {...register("name")} placeholder="Nama pemasok" />
            {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telepon</Label>
            <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-() ]/g, "") }} placeholder="08xxxxxxxxxx" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="npwp">NPWP</Label>
            <Input id="npwp" {...register("npwp")} placeholder="XX.XXX.XXX.X-XXX.XXX" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Controller
              name="paymentTermId"
              control={control}
              render={({ field }) => (
                <>
                  <Label htmlFor="paymentTermId">Termin Pembayaran</Label>
                  <FormSelect
                    id="paymentTermId"
                    value={field.value ? String(field.value) : ""}
                    onValueChange={(value) => field.onChange(value ? Number(value) : null)}
                    placeholder="Pilih termin"
                    options={paymentTerms.map((pt) => ({ value: String(pt.id), label: pt.name }))}
                  />
                </>
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} placeholder="email@vendor.com" />
            {errors.email && <span className="text-xs text-danger mt-1">{errors.email.message}</span>}
          </div>
        </FormSection>

        <FormSection title="Alamat">
          <div className="flex flex-col gap-1.5 col-span-full">
            <Label htmlFor="street">Alamat Jalan</Label>
            <Textarea id="address" {...register("address")} rows={2} placeholder="Alamat jalan lengkap" />
          </div>
          <AddressPicker defaultValues={{ province: vendor?.province ?? undefined, city: vendor?.city ?? undefined, district: vendor?.districtVendor ?? undefined, village: vendor?.villageVendor ?? undefined, postalCode: vendor?.postalCode ?? undefined }} />
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
