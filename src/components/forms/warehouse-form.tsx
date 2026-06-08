"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { warehouseSchema, type WarehouseInput } from "@/lib/validators"
import { createWarehouse, updateWarehouse } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/page-header"

interface WarehouseFormProps {
  warehouse?: {
    id: number
    name: string
    code: string | null
    address: string | null
  }
  generatedCode?: string
  enableAutoCode?: boolean
}

export function WarehouseForm({ warehouse, generatedCode, enableAutoCode = true }: WarehouseFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!warehouse

  const { register, handleSubmit, formState: { errors } } = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: {
      name: warehouse?.name || "",
      code: warehouse?.code || (enableAutoCode ? generatedCode : "") || "",
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

        const result = isEdit ? await updateWarehouse(warehouse!.id, formData) : await createWarehouse(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/master/gudang")
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
          <Input id="code" {...register("code")} readOnly={isEdit || enableAutoCode} className={isEdit || enableAutoCode ? "bg-muted" : undefined} placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} />
          {errors.code && <span className="text-xs text-danger mt-1">{errors.code.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Gudang *</Label>
          <Input id="name" {...register("name")} placeholder="Gudang Utama" />
          {errors.name && <span className="text-xs text-danger mt-1">{errors.name.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="address">Alamat</Label>
          <Textarea id="address" {...register("address")} rows={3} placeholder="Alamat gudang" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-warehouse">
          {isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
