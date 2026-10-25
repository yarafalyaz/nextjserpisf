"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState, type FormEvent } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { customerSchema, type CustomerInput } from "@/lib/validations/form.schemas"
import { createCustomer, updateCustomer } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { AlertTriangle } from "lucide-react"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { GENDER_CHOICES, OptionGroup } from "@/components/ui/option-group"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import {
  CustomerDuplicateWarningPanel,
  type CustomerDuplicateWarningView,
} from "@/components/forms/customer-duplicate-warning"

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
    taxpayerName?: string | null
    taxAddress?: string | null
    nitku?: string | null
    pkpStatus?: string | null
    pkpEffectiveFrom?: string | null
    pkpSource?: string | null
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
  // F-2026-10-25-003-S AC-CD-F1: peringatan duplikat dari respons server
  // (simpan tetap berhasil); panel tampil verbatim, navigasi ditunda
  // sampai operator menekan lanjut.
  const [duplicateWarning, setDuplicateWarning] =
    useState<CustomerDuplicateWarningView | null>(null)
  // F-2026-10-25-004-S: peringatan identitas pajak dari server
  // (taxWarnings, hanya ada bila legacy15/NITKU tak tertaut dsb.) —
  // tampil verbatim, simpan tetap berhasil, navigasi ditunda.
  const [taxWarnings, setTaxWarnings] = useState<string[]>([])

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
      taxId: customer?.taxId || "",
      taxpayerName: customer?.taxpayerName || "",
      taxAddress: customer?.taxAddress || "",
      nitku: customer?.nitku || "",
      pkpStatus: customer?.pkpStatus || "unknown",
      pkpEffectiveFrom: customer?.pkpEffectiveFrom || "",
      pkpSource: customer?.pkpSource || "",
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
        // BR-CD-05: quick-add reuse terucap — pesan server verbatim,
        // bukan sukses generik.
        if ("reused" in result && result.reused) {
          showSuccess(result.message ?? "Data berhasil ditambahkan")
          router.push("/master/pelanggan")
          router.refresh()
          return
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        // F-004-S: taxWarnings verbatim dari server — tampil sebelum
        // navigasi (data sudah tersimpan). Duplikat tetap prioritas panelnya.
        if ("taxWarnings" in result && result.taxWarnings?.length) {
          setTaxWarnings(result.taxWarnings)
          if (!result.duplicateWarning) return
        }
        // AC-CD-F1: warning dari server ditampilkan apa adanya; data
        // sudah tersimpan, jadi jangan navigasi sebelum operator baca.
        if (result.duplicateWarning) {
          setDuplicateWarning(result.duplicateWarning)
          return
        }
        router.push("/master/pelanggan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <>
      {taxWarnings.length ? (
        <div className="mb-6">
          <Alert variant="warning" aria-label="Peringatan identitas pajak pelanggan">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Peringatan identitas pajak</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {taxWarnings.map((w) => (<li key={w}>{w}</li>))}
              </ul>
              <div className="mt-3">
                <Button type="button" variant="primary" onPress={() => { router.push("/master/pelanggan"); router.refresh() }}>
                  Lanjut ke Daftar Pelanggan
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {duplicateWarning ? (
        <div className="mb-6">
          <CustomerDuplicateWarningPanel
            warning={duplicateWarning}
            onContinue={() => {
              router.push("/master/pelanggan")
              router.refresh()
            }}
          />
        </div>
      ) : null}
      <form onSubmit={handleSubmit(onSubmit)} aria-label={isEdit ? "Formulir ubah pelanggan" : "Formulir tambah pelanggan"} aria-busy={isPending}>
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
                  <QuickAddSelect
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : null)}
                    placeholder="Pilih kategori..."
                    options={categoryOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                    title={QUICK_ADD.customerCategory.title}
                    fields={QUICK_ADD.customerCategory.fields}
                    action={QUICK_ADD.customerCategory.action}
                    onCreated={(created) => {
                      setCategoryOptions((prev) => [...prev, { id: created.id, name: created.label }])
                      field.onChange(created.id)
                    }}
                  />
                )}
              />
              {errors.customerCategoryId && <span className="text-xs text-danger mt-1">{errors.customerCategoryId.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nama Pelanggan <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Input id="name" {...register("name")} placeholder="Nama lengkap" aria-required="true" />
              {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} placeholder="email@customer.com" />
              {errors.email && <span className="text-xs text-danger mt-1">{errors.email.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Telepon <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-() ]/g, "") }} placeholder="08xxxxxxxxxx" />
              {errors.phone && <span className="text-xs text-danger mt-1">{errors.phone.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxId">NPWP</Label>
              <Input id="taxId" {...register("taxId")} placeholder="Nomor Pokok Wajib Pajak" />
              {errors.taxId && <span className="text-xs text-danger mt-1">{errors.taxId.message}</span>}
            </div>
            <Controller
              name="gender"
              control={control}
              render={({ field }) => (
                <OptionGroup
                  id="gender"
                  label="Jenis Kelamin"
                  value={field.value ? String(field.value) : ""}
                  onChange={field.onChange}
                  options={GENDER_CHOICES}
                  optional
                />
              )}
            />
          </FormSection>
          <FormSection title="Identitas Pajak">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxpayerName">Nama Wajib Pajak</Label>
              <Input id="taxpayerName" {...register("taxpayerName")} placeholder="Nama sesuai NPWP (boleh beda nama dagang)" />
              {errors.taxpayerName && <span className="text-xs text-danger mt-1">{errors.taxpayerName.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nitku">NITKU</Label>
              <Input id="nitku" {...register("nitku")} placeholder="22 digit" inputMode="numeric" />
              {errors.nitku && <span className="text-xs text-danger mt-1">{errors.nitku.message}</span>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkpStatus">Status PKP</Label>
              <select id="pkpStatus" {...register("pkpStatus")} className="form-input" aria-label="Status PKP">
                <option value="unknown">Belum diketahui</option>
                <option value="non_pkp">Bukan PKP</option>
                <option value="pkp">PKP</option>
              </select>
              <p className="text-xs text-muted-foreground">Status PKP tidak menentukan kode transaksi faktur.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkpEffectiveFrom">Tanggal Pengukuhan PKP</Label>
              <Input id="pkpEffectiveFrom" type="date" {...register("pkpEffectiveFrom")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pkpSource">Sumber Status PKP</Label>
              <Input id="pkpSource" {...register("pkpSource")} placeholder="mis. SPPKP / konfirmasi lawan" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="taxAddress">Alamat Pajak</Label>
              <Textarea id="taxAddress" {...register("taxAddress")} rows={2} placeholder="Alamat sesuai NPWP (boleh beda alamat kirim)" />
              <p className="text-xs text-muted-foreground">Alamat pajak master dipakai ekspor Coretax secara live — belum dibekukan ke dokumen.</p>
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
    </>
  )
}
