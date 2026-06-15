"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createProject, updateProject } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
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
  generatedCode?: string
  project?: {
    id: number
    name: string
    documentNo: string | null
    description: string | null
    customerId: number
    customerVehicleId: number | null
    workOrderId: number | null
    startDate: string | null
    endDate: string | null
    notes: string | null
    status: string | null
  }
}

export function ProjectForm({ customers, customerVehicles = [], generatedCode, project }: ProjectFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!project

  const [customerId, setCustomerId] = useState(project?.customerId ? String(project.customerId) : "")
  const [customerVehicleId, setCustomerVehicleId] = useState(project?.customerVehicleId ? String(project.customerVehicleId) : "")

  // Filter vehicles by selected customer (reactive to customerId state)
  const filteredVehicles = customerId
    ? customerVehicles.filter((v) => v.customerId === Number(customerId))
    : customerVehicles

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentNo">No. Dokumen</Label>
          <Input id="documentNo" name="documentNo" value={project?.documentNo || generatedCode || ""} readOnly className="bg-default-soft font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Proyek *</Label>
          <Input id="name" name="name" required placeholder="Nama proyek" defaultValue={project?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan *</Label>
          <Combobox
            id="customerId"
            name="customerId"
            value={customerId || null}
            onChange={(key) => { setCustomerId(key ?? ""); setCustomerVehicleId("") }}
            placeholder="Cari pelanggan..."
            options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerVehicleId">Kendaraan Pelanggan</Label>
          <Combobox
            id="customerVehicleId"
            name="customerVehicleId"
            value={customerVehicleId || null}
            onChange={(key) => setCustomerVehicleId(key ?? "")}
            placeholder="Pilih kendaraan..."
            options={filteredVehicles.map((v) => ({ value: String(v.id), label: `${v.licensePlate || "-"} - ${v.vehicleName}` }))}
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
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="description">Deskripsi</Label>
          <Textarea id="description" name="description" rows={3} placeholder="Deskripsi proyek..." defaultValue={project?.description || ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan proyek..." defaultValue={project?.notes || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan Proyek"}</Button>
      </div>
    </form>
  )
}
