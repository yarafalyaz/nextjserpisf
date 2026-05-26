// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { customerSchema, type CustomerInput } from "@/lib/validators"
import { createCustomer, updateCustomer } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label, Select, ListBox } from "@heroui/react"
import { AddressPicker } from "@/components/ui/address-picker"

interface CustomerFormProps {
  customer?: {
    id: number
    name: string
    email: string | null
    phone: string | null
    address: string | null
    city: string | null
    npwp: string | null
    contactPerson: string | null
    gender: string | null
    code: string | null
  }
  generatedCode?: string
}

export function CustomerForm({ customer, generatedCode }: CustomerFormProps) {
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
      npwp: customer?.npwp || "",
      contactPerson: customer?.contactPerson || "",
      gender: customer?.gender || "",
      code: customer?.code || generatedCode || "",
    },
  })

  function onSubmit(data: CustomerInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        if (isEdit) { await updateCustomer(customer!.id, formData) }
        else { await createCustomer(formData) }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/customers")
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
          <Label htmlFor="code">Kode Customer</Label>
          <Input id="code" {...register("code")} readOnly className="bg-muted" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Customer *</Label>
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
          <Input id="phone" type="tel" inputMode="numeric" {...register("phone", { required: "Telepon wajib diisi" })} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9+\-() ]/g, '') }} placeholder="08xxxxxxxxxx" />
          {errors.phone && <span className="text-xs text-danger mt-1">{errors.phone.message}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="npwp">NPWP</Label>
          <Input id="npwp" {...register("npwp")} placeholder="XX.XXX.XXX.X-XXX.XXX" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Controller
            name="gender"
            control={control}
            render={({ field }) => (
              <Select selectedKey={field.value ? String(field.value) : null} onSelectionChange={(key) => field.onChange(key)} placeholder="-- Pilih --" className="w-full">
                <Label>Gender</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="male" id="male" textValue="Laki-laki">Laki-laki<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item key="female" id="female" textValue="Perempuan">Perempuan<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="street">Alamat Jalan</Label>
          <TextArea id="street" {...register("street")} rows={2} placeholder="Alamat jalan lengkap" />
        </div>
        <AddressPicker defaultValues={{ province: customer?.province, city: customer?.city, district: customer?.district, village: customer?.village, postalCode: customer?.postalCode }} />
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
