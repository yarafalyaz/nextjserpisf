"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"
import { createRackRow, updateRackRow, getNextRowCode } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface Warehouse {
  id: number
  name: string
  slug?: string | null
  racks: { id: number; name: string }[]
}

interface RackRowFormProps {
  warehouses: Warehouse[]
  enableAutoCode: boolean
  /** Gudang terpilih awal dari segmen path `gudang/<slug>` (jalur "buat dari"). */
  defaultWarehouseId?: number
  rackRow?: {
    id: number
    rackId: number
    code: string | null
    name: string
    rack: { id: number; warehouseId: number }
  }
}

export function RackRowForm({ warehouses, enableAutoCode, rackRow, defaultWarehouseId }: RackRowFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const initialWarehouseId = rackRow
    ? String(rackRow.rack.warehouseId)
    : defaultWarehouseId
      ? String(defaultWarehouseId)
      : ""
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId)
  const [rackId, setRackId] = useState(rackRow ? String(rackRow.rackId) : "")
  const [autoCode, setAutoCode] = useState("")
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)

  const selectedWarehouse = useMemo(
    () => warehouseOptions.find((w) => String(w.id) === warehouseId),
    [warehouseOptions, warehouseId],
  )
  const racks = selectedWarehouse?.racks ?? []

  // Fetch next code when rack changes
  useEffect(() => {
    if (!enableAutoCode || !rackId) return
    async function loadNextCode() {
      try {
        const res = await getNextRowCode(Number(rackId))
        setAutoCode(res.code ?? "")
      } catch (e) {
        // Gagal memuat kode berikutnya — kolom tetap bisa diisi manual.
        console.warn("[auto-code]", e instanceof Error ? e.message : e)
      }
    }
    void loadNextCode()
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

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
    { label: rackRow ? "Ubah" : "Tambah" },
  ]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={breadcrumbs} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          {rackRow ? "Ubah Baris Rak" : "Tambah Baris Rak"}
        </h1>
      </div>

      <form onSubmit={onSubmit} aria-busy={isPending} aria-label={rackRow ? "Formulir ubah baris rak" : "Formulir tambah baris rak"}>
        <FormCard>
          <input type="hidden" name="rackId" value={rackId} />
          {enableAutoCode && <input type="hidden" name="code" value={autoCode} />}

          <FormSection title="Informasi Umum">
            {/* Warehouse select */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouseId">Gudang <span className="text-destructive" aria-hidden="true">*</span></Label>
              <QuickAddSelect
                id="warehouseId"
                required
                value={warehouseId || null}
                onChange={handleWarehouseChange}
                placeholder="Cari gudang..."
                options={warehouseOptions.map((w) => ({ value: String(w.id), label: w.name }))}
                title={QUICK_ADD.warehouse.title}
                fields={QUICK_ADD.warehouse.fields}
                action={QUICK_ADD.warehouse.action}
                onCreated={(created) => {
                  setWarehouseOptions((prev) => [...prev, { id: created.id, name: created.label, racks: [] }])
                  setWarehouseId(String(created.id))
                  setRackId("")
                }}
              />
            </div>

            {/* Rack select (filtered by warehouse) */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rackIdSelect">Rak <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Combobox
                id="rackIdSelect"
                required
                value={rackId || null}
                onChange={handleRackChange}
                placeholder="Cari rak..."
                disabled={!warehouseId}
                options={racks.map((r) => ({ value: String(r.id), label: r.name }))}
              />
              {selectedWarehouse && racks.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Gudang ini belum punya rak.{" "}
                  <a
                    href={`/inventaris/rak/tambah/gudang/${selectedWarehouse.slug ?? selectedWarehouse.id}`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Buat Rak dulu
                  </a>{" "}
                  sebelum menambah baris rak.
                </p>
              )}
            </div>

            {/* Code input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code">Kode</Label>
              <Input
                id="code"
                name="code"
                readOnly={enableAutoCode}
                value={enableAutoCode ? autoCode : undefined}
                // Mode manual tidak punya nilai terkendali, jadi tanpa defaultValue
                // halaman Ubah menampilkan kode kosong dan menyimpan menghapusnya.
                defaultValue={enableAutoCode ? undefined : rackRow?.code ?? ""}
                onChange={() => {}}
                className={enableAutoCode ? "bg-muted font-mono" : undefined}
                placeholder={enableAutoCode ? "Pilih rak dulu..." : "Masukkan kode manual"}
                required={!enableAutoCode}
              />
            </div>

            {/* Name input */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nama <span className="text-destructive" aria-hidden="true">*</span></Label>
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
