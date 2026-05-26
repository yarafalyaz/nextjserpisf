"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { warehouseSchema, type WarehouseInput } from "@/lib/validators"
import { createWarehouse, updateWarehouse } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label } from "@heroui/react"

interface WarehouseFormProps {
  warehouse?: {
    id: number
    name: string
    code: string | null
    address: string | null
  }
  generatedCode?: string
}

export function WarehouseForm({ warehouse, generatedCode }: WarehouseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!warehouse

  const { register, handleSubmit, formState: { errors } } = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: warehouse?.name || "",
      code: warehouse?.code || generatedCode || "",
      address: warehouse?.address || "",
    },
  })

  function onSubmit(data: WarehouseInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null) formData.append(key, String(value))
        })

        if (isEdit) {
          await updateWarehouse(warehouse!.id, formData)
        } else {
          await createWarehouse(formData)
        }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/warehouses")
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
          <Label htmlFor="code">Kode Gudang *</Label>
          <Input id="code" {...register("code")} readOnly className="bg-muted" />
          {errors.code && <span className="text-xs text-danger mt-1">{errors.code.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Gudang *</Label>
          <Input id="name" {...register("name")} placeholder="Gudang Utama" />
          {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="address">Alamat</Label>
          <TextArea id="address" {...register("address")} rows={3} placeholder="Alamat gudang" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="submit-warehouse">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </button>
      </div>
    </form>
  )
}
