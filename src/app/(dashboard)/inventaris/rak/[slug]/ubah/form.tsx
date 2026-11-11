"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { updateRack } from "@/actions/inventory.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface Props {
  id: number
  code: string
  name: string
  warehouseId: number
  warehouses: { id: number; name: string }[]
}

export function RackEditForm({ id, code, name, warehouseId, warehouses }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [whId, setWhId] = useState(String(warehouseId))
  const [warehouseOptions, setWarehouseOptions] = useState(warehouses)

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("warehouseId", whId)
    startTransition(async () => {
      const res = await updateRack(id, formData)
      if (res && !res.success) {
        showError(res.error || "Gagal menyimpan data")
        return
      }
      showSuccess("Data berhasil diperbarui")
      router.push("/inventaris/rak")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Formulir ubah rak" aria-busy={isPending}>
      <FormCard>
        <input type="hidden" name="warehouseId" value={whId} />
        <FormSection title="Informasi Lokasi Rak">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">
              Kode Rak <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="code"
              name="code"
              required
              defaultValue={code}
              className="font-mono tabular-nums"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Nama Rak <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input id="name" name="name" required defaultValue={name} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="warehouseIdSelect">
              Gudang <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <QuickAddSelect
              id="warehouseIdSelect"
              required
              value={whId || null}
              onChange={(key) => setWhId(key ?? "")}
              placeholder="Cari gudang..."
              options={warehouseOptions.map((w) => ({ value: String(w.id), label: w.name }))}
              title={QUICK_ADD.warehouse.title}
              fields={QUICK_ADD.warehouse.fields}
              action={QUICK_ADD.warehouse.action}
              onCreated={(created) => {
                setWarehouseOptions((prev) => [...prev, { id: created.id, name: created.label }])
                setWhId(String(created.id))
              }}
            />
          </div>
        </FormSection>

        <FormActions>
          <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button
            className="w-full sm:w-auto"
            type="submit"
            variant="primary"
            isDisabled={isPending}
          >
            {isPending ? "Menyimpan..." : "Perbarui"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
