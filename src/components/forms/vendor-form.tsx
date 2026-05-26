"use client"

import { useRouter } from "next/navigation"
import { useTransition, type FormEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { vendorSchema, type VendorInput } from "@/lib/validators"
import { createVendor, updateVendor } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label, Select, ListBox, Select as HeroSelect } from "@heroui/react"
import { AddressPicker } from "@/components/ui/address-picker"
import { SelectValue, Input, TextArea } from "@/components/ui/heroui-compat"
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
    npwp: string | null
    contactPerson: string | null
    paymentTermId: number | null
  }
  generatedCode?: string
  paymentTerms?: { id: number; name: string }[]
}

export function VendorForm({ vendor, generatedCode, paymentTerms = [] }: VendorFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!vendor

  const { register, handleSubmit, control, formState: { errors } } = useForm<VendorInput>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      code: vendor?.code || generatedCode || "",
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

        if (isEdit) {
          await updateVendor(vendor!.id, formData)
        } else {
          await createVendor(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/vendors")
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
            <Input id="code" {...register("code")} readOnly className="bg-muted" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Vendor *</Label>
            <Input id="name" {...register("name")} placeholder="Nama vendor" />
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
                <Select selectedKey={field.value ? String(field.value) : ""} onSelectionChange={(key) => field.onChange(key ? Number(key) : null)} className="w-full">
                  <Label>Termin Pembayaran</Label>
                  <HeroSelect.Trigger><SelectValue placeholder="Pilih termin" /><HeroSelect.Indicator /></HeroSelect.Trigger>
                  <HeroSelect.Popover>
                    <ListBox>
                      {paymentTerms.map((pt) => (
                        <ListBox.Item key={String(pt.id)} id={String(pt.id)} textValue={pt.name}>{pt.name}<ListBox.ItemIndicator /></ListBox.Item>
                      ))}
                    </ListBox>
                  </HeroSelect.Popover>
                </Select>
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
            <TextArea id="address" {...register("address")} rows={2} placeholder="Alamat jalan lengkap" />
          </div>
          <AddressPicker defaultValues={{ city: vendor?.city ?? undefined }} />
        </FormSection>

        <FormActions>
          <Button onClick={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
