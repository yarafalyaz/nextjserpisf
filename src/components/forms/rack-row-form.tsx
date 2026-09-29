"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { createRackRow, updateRackRow, getNextRowCode } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface Warehouse {
  id: number
  name: string
  racks: { id: number; name: string }[]
}

interface RackRowFormProps {
  warehouses: Warehouse[]
  enableAutoCode: boolean
  rackRow?: {
    id: number
    rackId: number
    code: string | null
    name: string
    rack: { id: number; warehouseId: number }
  }
}

export function RackRowForm({ warehouses, enableAutoCode, rackRow }: RackRowFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const initialWarehouseId = rackRow
    ? String(rackRow.rack.warehouseId)
    : searchParams.get("warehouseId") || ""
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId)
  const [rackId, setRackId] = useState(rackRow ? String(rackRow.rackId) : "")
  const [autoCode, setAutoCode] = useState("")

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => String(w.id) === warehouseId),
    [warehouses, warehouseId],
  )
  const racks = selectedWarehouse?.racks ?? []

  // Fetch next code when rack changes
  useEffect(() => {
    if (!enableAutoCode || !rackId) return
    getNextRowCode(Number(rackId)).then((res) => {
      setAutoCode(res.code ?? "")
    })
  }, [rackId, enableAutoCode])

  function handleWarehouseChange(key: string | null) {
    const nextWarehouseId = String(key ?? "")
    const nextWarehouse = warehouses.find((w) => String(w.id) === nextWarehouseId)

    setWarehouseId(nextWarehouseId)

    if (!nextWarehouse || !nextWarehouse.racks.some((r) => String(r.id) === rackId)) {
      setRackId("")
    }
  }

  function handleRackChange(key: string | null) {
    setAutoCode("")
    setRackId(key ?? "")
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("rackId", rackId)

    startTransition(async () => {
      try {
        let result: { success: boolean; error?: string }
        if (rackRow) {
          result = await updateRackRow(rackRow.id, formData)
        } else {
          result = await createRackRow(formData)
        }

        if (!result?.success) {
          throw new Error(result?.error || "Gagal menyimpan data")
        }

        showSuccess(rackRow ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/inventaris/baris-rak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  const breadcrumbs = [
    { label: "Dasbor", href: "/" },
    { label: "Inventaris", href: "/inventaris" },
    { label: "Baris Rak", href: "/inventaris/baris-rak" },
    { label: rackRow ? "Edit" : "Tambah" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={breadcrumbs} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          {rackRow ? "Edit Baris Rak" : "Tambah Baris Rak"}
        </h1>
      </div>

      <form onSubmit={onSubmit}>
        <FormCard>
          <input type="hidden" name="rackId" value={rackId} />
          {enableAutoCode && <input type="hidden" name="code" value={autoCode} />}

          <FormSection title="Informasi Umum">
            {/* Warehouse select */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouseId">Gudang *</Label>
              <Combobox
                id="warehouseId"
                value={warehouseId || null}
                onChange={handleWarehouseChange}
                placeholder="Cari gudang..."
                options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
              />
            </div>

            {/* Rack select (filtered by warehouse) */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rackIdSelect">Rak *</Label>
              <Combobox
                id="rackIdSelect"
                value={rackId || null}
                onChange={handleRackChange}
                placeholder="Cari rak..."
                disabled={!warehouseId}
                options={racks.map((r) => ({ value: String(r.id), label: r.name }))}
              />
            </div>

            {/* Code input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Kode</Label>
              <Input
                id="code"
                name="code"
                readOnly={enableAutoCode}
                value={enableAutoCode ? autoCode : undefined}
                onChange={() => {}}
                className={enableAutoCode ? "bg-muted font-mono" : undefined}
                placeholder={enableAutoCode ? "Pilih rak dulu..." : "Masukkan kode manual"}
                required={!enableAutoCode}
              />
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nama *</Label>
              <Input
                id="name"
                name="name"
                placeholder="Nama baris rak"
                defaultValue={rackRow?.name || ""}
                required
              />
            </div>
          </FormSection>

          <FormActions>
            <Button type="button" onPress={() => router.back()}>Batal</Button>
            <Button type="submit" variant="primary" isDisabled={isPending}>
              {isPending ? "Menyimpan..." : rackRow ? "Perbarui" : "Simpan"}
            </Button>
          </FormActions>
        </FormCard>
      </form>
    </div>
  )
}
