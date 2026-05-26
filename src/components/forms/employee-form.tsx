// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { employeeSchema, type EmployeeInput } from "@/lib/validators"
import { createEmployee, updateEmployee } from "@/actions/master.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label, ComboBox, ListBox, InputGroup, Select } from "@heroui/react"
import { AddressPicker } from "@/components/ui/address-picker"

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
  }
  departments: { id: number; name: string }[]
  positions: { id: number; name: string }[]
  generatedCode?: string
}

export function EmployeeForm({ employee, departments, positions, generatedCode }: EmployeeFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!employee

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      employeeNo: employee?.employeeNo || generatedCode || "",
      name: employee?.name || "",
      email: employee?.email || "",
      phone: employee?.phone || "",
      gender: employee?.gender || "",
      dateOfBirth: employee?.dateOfBirth || "",
      maritalStatus: employee?.maritalStatus || "",
      departmentId: employee?.departmentId || undefined,
      positionId: employee?.positionId || undefined,
      joinDate: employee?.joinDate || new Date().toISOString().split("T")[0],
      paymentFrequency: employee?.paymentFrequency || "MONTHLY",
      baseSalary: employee?.baseSalary || 0,
    },
  })

  const paymentFrequency = watch("paymentFrequency")

  function onSubmit(data: EmployeeInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })
        if (isEdit) {
          await updateEmployee(employee!.id, formData)
        } else {
          await createEmployee(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/employees")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      {/* Section: Data Pribadi */}
      <h3 className="form-section-title">Data Pribadi</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="employeeNo">No. Karyawan</Label>
          <Input id="employeeNo" {...register("employeeNo")} readOnly className="bg-muted" />
          {errors.employeeNo && <span className="text-xs text-danger mt-1">{errors.employeeNo.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama *</Label>
          <Input id="name" {...register("name")} placeholder="Nama lengkap" />
          {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Telepon</Label>
          <Input id="phone" type="tel" inputMode="numeric" {...register("phone")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9+\-() ]/g, '') }} placeholder="08xxxxxxxxxx" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="gender"
            control={control}
            render={({ field }) => (
              <Select selectedKey={field.value || null} onSelectionChange={(key) => field.onChange(key ? String(key) : "")} className="w-full">
                <Label>Jenis Kelamin</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="M" id="M" textValue="Laki-laki">Laki-laki<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item key="F" id="F" textValue="Perempuan">Perempuan<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
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
              <Select selectedKey={field.value || null} onSelectionChange={(key) => field.onChange(key ? String(key) : "")} className="w-full">
                <Label>Status Pernikahan</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="Single" id="Single" textValue="Belum Menikah">Belum Menikah<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item key="Married" id="Married" textValue="Menikah">Menikah<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item key="Divorced" id="Divorced" textValue="Cerai">Cerai<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
        </div>
      </div>

      {/* Section: Informasi Pekerjaan & Gaji */}
      <h3 className="form-section-title">Informasi Pekerjaan &amp; Gaji</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Controller
            name="departmentId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Department</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari department..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {departments.map((d) => (
                      <ListBox.Item key={d.id} id={String(d.id)} textValue={d.name}>
                        {d.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Controller
            name="positionId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
              >
                <Label>Posisi</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari posisi..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {positions.map((p) => (
                      <ListBox.Item key={p.id} id={String(p.id)} textValue={p.name}>
                        {p.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
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
              <Select selectedKey={field.value || "MONTHLY"} onSelectionChange={(key) => field.onChange(String(key))} className="w-full">
                <Label>Tipe Pembayaran</Label>
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="MONTHLY" id="MONTHLY" textValue="Bulanan">Bulanan<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item key="WEEKLY" id="WEEKLY" textValue="Mingguan">Mingguan<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="baseSalary">Gaji Pokok ({paymentFrequency === "WEEKLY" ? "Per Minggu" : "Per Bulan"})</Label>
          <InputGroup>
            <InputGroup.Prefix>Rp</InputGroup.Prefix>
            <InputGroup.Input id="baseSalary" type="number" {...register("baseSalary", { valueAsNumber: true })} placeholder="0" />
          </InputGroup>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} placeholder="email@company.com" />
        </div>
      </div>

      {/* Section: Identitas & Bank */}
      <h3 className="form-section-title">Identitas &amp; Bank</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
          <Input id="bankAccountNumber" inputMode="numeric" {...register("bankAccountNumber")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9]/g, '') }} placeholder="No. rekening" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bankAccountHolder">Atas Nama</Label>
          <Input id="bankAccountHolder" {...register("bankAccountHolder")} placeholder="Nama pemilik rekening" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bpjsKetenagakerjaan">BPJS Ketenagakerjaan</Label>
          <Input id="bpjsKetenagakerjaan" inputMode="numeric" {...register("bpjsKetenagakerjaan")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9]/g, '') }} placeholder="No. BPJS Ketenagakerjaan" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bpjsKesehatan">BPJS Kesehatan</Label>
          <Input id="bpjsKesehatan" inputMode="numeric" {...register("bpjsKesehatan")} onInput={(e: any) => { e.target.value = e.target.value.replace(/[^0-9]/g, '') }} placeholder="No. BPJS Kesehatan" />
        </div>
      </div>

      {/* Section: Alamat */}
      <h3 className="form-section-title">Alamat</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="street">Alamat</Label>
          <TextArea id="street" {...register("street")} rows={2} placeholder="Alamat lengkap" />
        </div>
        <AddressPicker defaultValues={{ province: employee?.province, city: employee?.employeeCity, district: employee?.employeeDistrict, village: employee?.employeeVillage, postalCode: employee?.postalCode }} />
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-employee">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
