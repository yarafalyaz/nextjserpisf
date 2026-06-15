"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useTransition, useState, type FormEvent } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { employeeSchema, type EmployeeInput } from "@/lib/validators"
import { createEmployee, updateEmployee } from "@/actions/master.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group"
import { Combobox } from "@/components/ui/combobox"
import { AddressPicker } from "@/components/ui/address-picker"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface EmployeeFormProps {
  employee?: {
    id: number
    employeeNo: string
    name: string
    email: string | null
    phone: string | null
    gender: string | null
    dateOfBirth: string | null
    maritalStatus: string | null
    departmentId: number | null
    positionId: number | null
    joinDate: string
    paymentFrequency: string
    baseSalary: number
    city?: string | null
    province?: string | null
    employeeCity?: string | null
    employeeDistrict?: string | null
    employeeVillage?: string | null
    postalCode?: string | null
    hasLoginAccount?: boolean
    roleIds?: string[]
  }
  departments: { id: number; name: string }[]
  positions: { id: number; name: string }[]
  generatedCode?: string
  enableAutoCode?: boolean
  roles?: { id: number; name: string }[]
}

export function EmployeeForm({ employee, departments, positions, generatedCode, enableAutoCode = true, roles = [] }: EmployeeFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!employee
  // Login account can be offered when creating, or when editing an employee
  // that doesn't have a login account yet.
  const canOfferLogin = !isEdit || !employee?.hasLoginAccount
  const [createLogin, setCreateLogin] = useState(false)
  const [loginRoleIds, setLoginRoleIds] = useState<string[]>(employee?.roleIds || [])

  const roleOptions = roles.map((r) => ({
    id: String(r.id),
    label: r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }))

  function toggleLoginRole(id: string) {
    setLoginRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toDateInputValue = (value?: string | Date | null) => {
    if (!value) return ""
    if (typeof value === "string") return value.includes("T") ? value.split("T")[0] : value
    if (value instanceof Date) return value.toISOString().split("T")[0]
    return ""
  }

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema) as Resolver<EmployeeInput>,
    defaultValues: {
      employeeNo: employee?.employeeNo || (enableAutoCode ? generatedCode : "") || "",
      name: employee?.name || "",
      email: employee?.email || "",
      phone: employee?.phone || "",
      gender: employee?.gender || "",
      dateOfBirth: toDateInputValue(employee?.dateOfBirth),
      maritalStatus: employee?.maritalStatus || "",
      departmentId: employee?.departmentId || undefined,
      positionId: employee?.positionId || undefined,
      joinDate: toDateInputValue(employee?.joinDate) || new Date().toISOString().split("T")[0],
      paymentFrequency: employee?.paymentFrequency || "MONTHLY",
      baseSalary: employee?.baseSalary || 0,
    },
  })

  const paymentFrequency = watch("paymentFrequency")

  function onSubmit(data: EmployeeInput, event?: React.BaseSyntheticEvent) {
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

        // Optional login account (create, or edit for employees without one)
        if (canOfferLogin && createLogin) {
          formData.set("createLoginAccount", "true")
          const passInput = form?.querySelector(`input[name="loginPassword"]`) as HTMLInputElement | null
          if (passInput?.value) formData.set("loginPassword", passInput.value)
          loginRoleIds.forEach((id) => formData.append("loginRoleIds", id))
        } else if (isEdit && employee?.hasLoginAccount) {
          loginRoleIds.forEach((id) => formData.append("loginRoleIds", id))
        }

        const result = isEdit
          ? await updateEmployee(employee!.id, formData)
          : await createEmployee(formData)

        if (!result?.success) {
          throw new Error(result?.error || "Gagal menyimpan data")
        }

        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/karyawan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Data Pribadi">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employeeNo">No. Karyawan</Label>
            <Input id="employeeNo" {...register("employeeNo")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan no. karyawan manual"} />
            {errors.employeeNo && <span className="text-xs text-danger mt-1">{errors.employeeNo.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama *</Label>
            <Input id="name" {...register("name")} placeholder="Nama lengkap" />
            {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telepon</Label>
            <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9+\-() ]/g, "") }} placeholder="08xxxxxxxxxx" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="gender"
              control={control}
              render={({ field }) => (
                <>
                  <Label>Jenis Kelamin</Label>
                  <RadioGroup value={field.value || ""} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2 pt-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="M" /> Laki-laki
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="F" /> Perempuan
                    </label>
                  </RadioGroup>
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Lahir"
              name="dateOfBirth"
              value={watch("dateOfBirth")}
              onChange={(val) => setValue("dateOfBirth", val)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="maritalStatus"
              control={control}
              render={({ field }) => (
                <>
                  <Label>Status Pernikahan</Label>
                  <RadioGroup value={field.value || ""} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2 pt-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="Single" /> Belum Menikah
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="Married" /> Menikah
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="Divorced" /> Cerai
                    </label>
                  </RadioGroup>
                </>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Informasi Pekerjaan & Gaji">
          <div className="flex flex-col gap-1.5">
            <Controller
              name="departmentId"
              control={control}
              render={({ field }) => (
                <>
                  <Label>Departemen</Label>
                  <Combobox
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    placeholder="Cari departemen..."
                    options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="positionId"
              control={control}
              render={({ field }) => (
                <>
                  <Label>Jabatan</Label>
                  <Combobox
                    value={field.value ? String(field.value) : null}
                    onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                    placeholder="Cari jabatan..."
                    options={positions.map((p) => ({ value: String(p.id), label: p.name }))}
                  />
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Masuk"
              name="joinDate"
              value={watch("joinDate")}
              onChange={(val) => setValue("joinDate", val)}
              required
            />
            {errors.joinDate && <span className="text-xs text-danger mt-1">{errors.joinDate.message}</span>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Controller
              name="paymentFrequency"
              control={control}
              render={({ field }) => (
                <>
                  <Label>Tipe Pembayaran</Label>
                  <RadioGroup value={field.value || "MONTHLY"} onValueChange={field.onChange} className="flex flex-wrap gap-x-6 gap-y-2 pt-1.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="MONTHLY" /> Bulanan
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <RadioGroupItem value="WEEKLY" /> Mingguan
                    </label>
                  </RadioGroup>
                </>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baseSalary">Gaji Pokok ({paymentFrequency === "WEEKLY" ? "Per Minggu" : "Per Bulan"})</Label>
            <Controller name="baseSalary" control={control} render={({ field }) => <CurrencyInput id="baseSalary" value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="0" prefix="Rp" />} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} placeholder="email@company.com" />
          </div>
        </FormSection>

        <FormSection title="Identitas & Bank">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="idNumber">NIK</Label>
            <Input id="idNumber" {...register("idNumber")} placeholder="No. KTP / NIK" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="npwp">NPWP</Label>
            <Input id="npwp" {...register("npwp")} placeholder="XX.XXX.XXX.X-XXX.XXX" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankName">Nama Bank</Label>
            <Input id="bankName" {...register("bankName")} placeholder="Nama bank" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankAccountNumber">No. Rekening</Label>
            <Input id="bankAccountNumber" inputMode="numeric" {...register("bankAccountNumber")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, "") }} placeholder="No. rekening" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankAccountHolder">Atas Nama</Label>
            <Input id="bankAccountHolder" {...register("bankAccountHolder")} placeholder="Nama pemilik rekening" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bpjsKetenagakerjaan">BPJS Ketenagakerjaan</Label>
            <Input id="bpjsKetenagakerjaan" inputMode="numeric" {...register("bpjsKetenagakerjaan")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, "") }} placeholder="No. BPJS Ketenagakerjaan" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bpjsKesehatan">BPJS Kesehatan</Label>
            <Input id="bpjsKesehatan" inputMode="numeric" {...register("bpjsKesehatan")} onInput={(e: FormEvent<HTMLInputElement>) => { e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, "") }} placeholder="No. BPJS Kesehatan" />
          </div>
        </FormSection>

        <FormSection title="Alamat" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="street">Alamat</Label>
            <Textarea id="street" {...register("street")} rows={2} placeholder="Alamat lengkap" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <AddressPicker defaultValues={{ province: employee?.province ?? undefined, city: employee?.employeeCity ?? employee?.city ?? undefined, district: employee?.employeeDistrict ?? undefined, village: employee?.employeeVillage ?? undefined, postalCode: employee?.postalCode ?? undefined }} />
          </div>
        </FormSection>

        {isEdit && employee?.hasLoginAccount && (
          <FormSection title="Akun Login" columns={1}>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/10 text-success border border-success/20 font-medium">
                ✓ Karyawan ini memiliki akun login
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Peran</Label>
              <div className="p-3 border border-default rounded-lg bg-background min-h-[64px]">
                {roleOptions.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Belum ada peran. Buat di Pengaturan &gt; Peran.</span>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {roleOptions.map((role) => {
                      const selected = loginRoleIds.includes(role.id)
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => toggleLoginRole(role.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-surface border-default hover:border-primary/50 text-foreground"
                          }`}
                        >
                          {role.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">Pilih satu atau lebih peran untuk menentukan hak akses akun karyawan.</span>
            </div>
          </FormSection>
        )}

        {canOfferLogin && (
          <FormSection title="Akun Login" columns={1}>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={createLogin}
                onChange={(e) => setCreateLogin(e.target.checked)}
                className="h-4 w-4 rounded border-default accent-primary cursor-pointer"
              />
              <span>Buatkan akun login untuk karyawan ini</span>
            </label>
            <p className="text-xs text-muted-foreground -mt-1">
              Karyawan dengan akun login bisa masuk ke sistem (mis. untuk absensi mandiri). Email di atas dipakai sebagai email login.
            </p>

            {createLogin && (
              <div className="flex flex-col gap-5 pt-2 border-t border-default mt-2">
                <div className="flex flex-col gap-1.5 max-w-md">
                  <Label htmlFor="loginPassword">Kata Sandi *</Label>
                  <Input id="loginPassword" name="loginPassword" type="password" placeholder="Minimal 8 karakter" minLength={8} autoComplete="new-password" />
                  <span className="text-xs text-muted-foreground">Minimal 8 karakter. Pastikan email pada bagian atas sudah terisi.</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Peran</Label>
                  <div className="p-3 border border-default rounded-lg bg-background min-h-[64px]">
                    {roleOptions.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Belum ada peran. Buat di Pengaturan &gt; Peran.</span>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {roleOptions.map((role) => {
                          const selected = loginRoleIds.includes(role.id)
                          return (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => toggleLoginRole(role.id)}
                              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                                selected
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-surface border-default hover:border-primary/50 text-foreground"
                              }`}
                            >
                              {role.label}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">Pilih satu atau lebih peran untuk menentukan hak akses.</span>
                </div>
              </div>
            )}
          </FormSection>
        )}

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
