"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { warehouseSchema, type WarehouseInput } from "@/lib/validators"
import { createWarehouse, updateWarehouse } from "@/actions/master.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

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
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" isDisabled={isPending}  id="submit-warehouse">
          {isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
