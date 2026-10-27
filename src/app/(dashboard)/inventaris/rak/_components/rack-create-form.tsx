"use client"

import { useRouter } from "next/navigation"
import { useTransition, useEffect } from "react"
import { createRack, getNextRackCode } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface Warehouse {
  id: number
  name: string
}

interface RackCreateFormProps {
  enableAutoCode: boolean
  warehouses: Warehouse[]
  /** Gudang terpilih awal dari segmen path `gudang/<slug>` (jalur "buat dari"). */
  defaultWarehouseId?: number
}

export function RackCreateForm({ enableAutoCode, warehouses, defaultWarehouseId }: RackCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ? String(defaultWarehouseId) : "")
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)
  const [autoCode, setAutoCode] = useState("")

  // Fetch next code when warehouse changes
  useEffect(() => {
    if (!enableAutoCode || !warehouseId) return
    async function loadNextCode() {
      try {
        const res = await getNextRackCode(Number(warehouseId))
        setAutoCode(res.code)
      } catch (e) {
        // Gagal memuat kode berikutnya — kolom tetap bisa diisi manual.
        console.warn("[auto-code]", e instanceof Error ? e.message : e)
      }
    }
    void loadNextCode()
  }, [warehouseId, enableAutoCode])

  function handleWarehouseChange(key: string | null) {
    setAutoCode("")
    setWarehouseId(key ?? "")
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("warehouseId", warehouseId)
    startTransition(async () => {
      try {
        const result = await createRack(formData)
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data")
          return
        }
        showSuccess("Data berhasil ditambahkan")
        router.push("/inventaris/rak")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulir tambah rak" aria-busy={isPending} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode Rak{enableAutoCode ? null : <>{" "}<span className="text-destructive" aria-hidden="true">*</span></>}</Label>
          <Input
            id="code"
            name="code"
            readOnly={enableAutoCode}
            value={enableAutoCode ? autoCode : undefined}
            onChange={() => {}}
            className={enableAutoCode ? "bg-muted font-mono" : undefined}
            placeholder={enableAutoCode ? "Pilih gudang dulu..." : "Masukkan kode manual"}
            required={!enableAutoCode}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Rak <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="name" name="name" placeholder="Nama rak" required />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="warehouseIdSelect">Gudang <span className="text-destructive" aria-hidden="true">*</span></Label>
          <QuickAddSelect
            id="warehouseIdSelect"
            required
            value={warehouseId || null}
            onChange={handleWarehouseChange}
            placeholder="Cari gudang..."
            options={warehouseOptions.map((w) => ({ value: String(w.id), label: w.name }))}
            title={QUICK_ADD.warehouse.title}
            fields={QUICK_ADD.warehouse.fields}
            action={QUICK_ADD.warehouse.action}
            onCreated={(created) => {
              setWarehouseOptions((prev) => [...prev, { id: created.id, name: created.label }])
              setAutoCode("")
              setWarehouseId(String(created.id))
            }}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()}>Batal</Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-rack">
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
