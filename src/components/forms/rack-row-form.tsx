"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { createRackRow, updateRackRow } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, Label, ComboBox, ListBox } from "@heroui/react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

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
  const [isPending, startTransition] = useTransition()

  const initialWarehouseId = rackRow ? String(rackRow.rack.warehouseId) : ""
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId)
  const [rackId, setRackId] = useState(rackRow ? String(rackRow.rackId) : "")

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => String(w.id) === warehouseId),
    [warehouses, warehouseId],
  )
  const racks = selectedWarehouse?.racks ?? []

  function handleWarehouseChange(key: React.Key | null) {
    const nextWarehouseId = String(key ?? "")
    const nextWarehouse = warehouses.find((w) => String(w.id) === nextWarehouseId)

    setWarehouseId(nextWarehouseId)

    if (!nextWarehouse || !nextWarehouse.racks.some((r) => String(r.id) === rackId)) {
      setRackId("")
    }
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

        showSuccess(rackRow ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/inventaris/baris-rak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Inventory", href: "/inventaris" },
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

          <FormSection title="Informasi Umum">
            {/* Warehouse select */}
            <div className="flex flex-col gap-1.5">
              <ComboBox
                selectedKey={warehouseId || null}
                onSelectionChange={handleWarehouseChange}
                className="w-full"
              >
                <Label>Gudang *</Label>
                <ComboBox.InputGroup><Input placeholder="Cari gudang..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {warehouses.map((w) => (
                      <ListBox.Item key={w.id} id={String(w.id)} textValue={w.name}>{w.name}</ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            </div>

            {/* Rack select (filtered by warehouse) */}
            <div className="flex flex-col gap-1.5">
              <ComboBox
                selectedKey={rackId || null}
                onSelectionChange={(key) => setRackId(String(key ?? ""))}
                className="w-full"
                isDisabled={!warehouseId}
              >
                <Label>Rak *</Label>
                <ComboBox.InputGroup><Input placeholder="Cari rak..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {racks.map((r) => (
                      <ListBox.Item key={r.id} id={String(r.id)} textValue={r.name}>{r.name}</ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            </div>

            {/* Code input */}
            {!enableAutoCode && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Kode</Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="Kode baris rak"
                  defaultValue={rackRow?.code || ""}
                />
              </div>
            )}

            {enableAutoCode && (
              <div className="flex flex-col gap-1.5">
                <Label>Kode</Label>
                <Input
                  disabled
                  placeholder="Auto-generated"
                  defaultValue={rackRow?.code || ""}
                />
                <input type="hidden" name="code" value={rackRow?.code || ""} />
              </div>
            )}

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
              {isPending ? "Menyimpan..." : rackRow ? "Update" : "Simpan"}
            </Button>
          </FormActions>
        </FormCard>
      </form>
    </div>
  )
}
