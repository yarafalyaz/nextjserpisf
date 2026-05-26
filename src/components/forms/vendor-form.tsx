// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { vendorSchema, type VendorInput } from "@/lib/validators"
import { createVendor, updateVendor } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label, Select, ListBox } from "@heroui/react"
import { AddressPicker } from "@/components/ui/address-picker"

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
      paymentTermId: vendor?.paymentTermId || undefined,
    },
  })

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
    <form onSubmit={handleSubmit(onSubmit)} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
          <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9+\-() ]/g, '') }} placeholder="08xxxxxxxxxx" />
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
                <Select.Trigger><Select.Value placeholder="Pilih termin" /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {paymentTerms.map((pt) => (
                      <ListBox.Item key={String(pt.id)} id={String(pt.id)} textValue={pt.name}>{pt.name}<ListBox.ItemIndicator /></ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="email@vendor.com" />
          {errors.email && <span className="text-xs text-danger mt-1">{errors.email.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="street">Alamat Jalan</Label>
          <TextArea id="street" {...register("street")} rows={2} placeholder="Alamat jalan lengkap" />
        </div>
        <AddressPicker defaultValues={{ province: vendor?.province, city: vendor?.city, district: vendor?.districtVendor, village: vendor?.villageVendor, postalCode: vendor?.postalCode }} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bankName">Nama Bank</Label>
          <Input id="bankName" {...register("bankName")} placeholder="Nama bank" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bankAccountNumber">No. Rekening</Label>
          <Input id="bankAccountNumber" inputMode="numeric" {...register("bankAccountNumber")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9]/g, '') }} placeholder="No. rekening" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bankAccountHolder">Atas Nama</Label>
          <Input id="bankAccountHolder" {...register("bankAccountHolder")} placeholder="Nama pemilik rekening" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-vendor">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
