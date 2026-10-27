"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createProject, updateProject } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { Button } from "@/components/ui/button"

interface CustomerVehicleOption {
  id: number
  licensePlate: string | null
  vehicleName: string
  customerId: number
}

interface ProjectFormProps {
  customers: { id: number; name: string }[]
  customerVehicles?: CustomerVehicleOption[]
  costCenters?: { id: number; code: string; name: string }[]
  generatedCode?: string
  project?: {
    id: number
    name: string
    documentNo: string | null
    description: string | null
    customerId: number
    customerVehicleId: number | null
    workOrderId: number | null
    costCenterId?: number | null
    startDate: string | null
    endDate: string | null
    notes: string | null
    status: string | null
  }
}

export function ProjectForm({ customers, customerVehicles = [], costCenters = [], generatedCode, project }: ProjectFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!project

  const [customerId, setCustomerId] = useState(project?.customerId ? String(project.customerId) : "")
  const [customerVehicleId, setCustomerVehicleId] = useState(project?.customerVehicleId ? String(project.customerVehicleId) : "")
  const [customerOptions, setCustomerOptions] = useState(customers)
  const [costCenterOptions, setCostCenterOptions] = useState(costCenters)
  const [costCenterId, setCostCenterId] = useState(project?.costCenterId ? String(project.costCenterId) : "")

  // Filter vehicles by selected customer (reactive to customerId state). Disimpan di
  // state supaya kendaraan yang baru dibuat lewat quick-add langsung muncul.
  const [vehicleOptions, setVehicleOptions] = useState(() =>
    customerVehicles.map((v) => ({
      id: v.id,
      customerId: v.customerId,
      label: `${v.licensePlate || "-"} - ${v.vehicleName}`,
    })),
  )
  const filteredVehicles = customerId
    ? vehicleOptions.filter((v) => v.customerId === Number(customerId))
    : vehicleOptions

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = isEdit ? await updateProject(project!.id, formData) : await createProject(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/proyek")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={isEdit ? "Formulir ubah proyek" : "Formulir tambah proyek"} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentNo">No. Dokumen</Label>
          <Input id="documentNo" name="documentNo" value={project?.documentNo || generatedCode || ""} readOnly className="bg-default-soft font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Proyek <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="name" name="name" required placeholder="Nama proyek" defaultValue={project?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan <span className="text-destructive" aria-hidden="true">*</span></Label>
          <QuickAddSelect
            id="customerId"
            name="customerId"
            required
            value={customerId || null}
            onChange={(key) => { setCustomerId(key ?? ""); setCustomerVehicleId("") }}
            placeholder="Cari pelanggan..."
            options={customerOptions.map((c) => ({ value: String(c.id), label: c.name }))}
            title={QUICK_ADD.customer.title}
            fields={QUICK_ADD.customer.fields}
            action={QUICK_ADD.customer.action}
            onCreated={(created) => {
              setCustomerOptions((prev) => [...prev, { id: created.id, name: created.label }])
              setCustomerId(String(created.id))
              setCustomerVehicleId("")
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerVehicleId">Kendaraan Pelanggan</Label>
          <QuickAddSelect
            id="customerVehicleId"
            name="customerVehicleId"
            value={customerVehicleId || null}
            onChange={(key) => setCustomerVehicleId(key ?? "")}
            disabled={!customerId}
            placeholder={customerId ? "Pilih kendaraan..." : "Pilih pelanggan dulu"}
            options={filteredVehicles.map((v) => ({ value: String(v.id), label: v.label }))}
            title={QUICK_ADD.customerVehicle.title}
            fields={QUICK_ADD.customerVehicle.fields}
            action={QUICK_ADD.customerVehicle.action}
            getLabel={QUICK_ADD.customerVehicle.getLabel}
            extraValues={{ customerId }}
            onCreated={(created) => {
              if (!customerId) return
              setVehicleOptions((prev) => [
                ...prev,
                { id: created.id, customerId: Number(customerId), label: created.label },
              ])
              setCustomerVehicleId(String(created.id))
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Mulai"
            name="startDate"
            defaultValue={project?.startDate || undefined}
            onChange={() => {}}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Selesai"
            name="endDate"
            defaultValue={project?.endDate || undefined}
            onChange={() => {}}
          />
        </div>
        {costCenters.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="costCenterId">Pusat Biaya</Label>
          <QuickAddSelect
            id="costCenterId"
            name="costCenterId"
            options={costCenterOptions.map((cc) => ({ value: String(cc.id), label: `${cc.code} — ${cc.name}` }))}
            value={costCenterId || null}
            onChange={(key) => setCostCenterId(key ?? "")}
            placeholder="— Pilih pusat biaya —"
            title={QUICK_ADD.costCenter.title}
            fields={QUICK_ADD.costCenter.fields}
            action={QUICK_ADD.costCenter.action}
            onCreated={(created) => {
              setCostCenterOptions((prev) => [...prev, { id: created.id, code: "", name: created.label }])
              setCostCenterId(String(created.id))
            }}
          />
        </div>
        )}
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi proyek..." defaultValue={project?.description || ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan proyek..." defaultValue={project?.notes || ""} />
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} className="w-full sm:w-auto">Batal</Button>
        <Button type="submit" isDisabled={isPending} className="w-full sm:w-auto">{isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan Proyek"}</Button>
      </div>
    </form>
  )
}
