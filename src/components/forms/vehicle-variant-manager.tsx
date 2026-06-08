"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2 } from "lucide-react"
import { createVehicleVariant, deleteVehicleVariant } from "@/actions/vehicle.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/shadcn/button"
import { Label } from "@/components/ui/shadcn/label"
import { Combobox } from "@/components/ui/combobox"

interface Variant {
  id: number
  name: string
  drivetrain: string | null
  transmission: string | null
}

interface VehicleVariantManagerProps {
  modelId: number
  variants: Variant[]
}

const DRIVETRAIN_OPTIONS = [
  { value: "4x2", label: "4x2" },
  { value: "4x4", label: "4x4" },
  { value: "AWD", label: "AWD" },
]

const TRANSMISSION_OPTIONS = [
  { value: "AT", label: "AT (Otomatis)" },
  { value: "MT", label: "MT (Manual)" },
  { value: "CVT", label: "CVT" },
]

export function VehicleVariantManager({ modelId, variants }: VehicleVariantManagerProps) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [drivetrain, setDrivetrain] = useState<string | null>(null)
  const [transmission, setTransmission] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    startTransition(async () => {
      const formData = new FormData()
      formData.set("modelId", String(modelId))
      formData.set("name", trimmed)
      if (drivetrain) formData.set("drivetrain", drivetrain)
      if (transmission) formData.set("transmission", transmission)
      const result = await createVehicleVariant(formData)
      if (!result.success) {
        showError(result.error || "Gagal menambah varian")
        return
      }
      showSuccess("Varian ditambahkan")
      setName("")
      setDrivetrain(null)
      setTransmission(null)
      router.refresh()
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      const result = await deleteVehicleVariant(id)
      if (!result.success) {
        showError(result.error || "Gagal menghapus varian")
        return
      }
      showSuccess("Varian dihapus")
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Tipe / Varian</h2>
        <p className="text-sm text-muted-foreground">
          Daftar tipe/varian untuk model ini. Contoh: 2.4 VRZ GR Sport, penggerak 4x2, transmisi AT.
        </p>
      </div>

      <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="variant-name">Nama Tipe / Varian *</Label>
          <Input
            id="variant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: 2.4 VRZ GR Sport"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-32">
          <Label>Penggerak</Label>
          <Combobox
            options={DRIVETRAIN_OPTIONS}
            value={drivetrain}
            onChange={setDrivetrain}
            placeholder="Pilih..."
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-40">
          <Label>Transmisi</Label>
          <Combobox
            options={TRANSMISSION_OPTIONS}
            value={transmission}
            onChange={setTransmission}
            placeholder="Pilih..."
          />
        </div>
        <Button type="submit" disabled={isPending || !name.trim()}>
          <Plus className="size-4" /> Tambah
        </Button>
      </form>

      <div className="mt-4 flex flex-col divide-y divide-default rounded-md border border-default">
        {variants.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Belum ada varian</p>
        ) : (
          variants.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium">{v.name}</span>
                {v.drivetrain && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {v.drivetrain}
                  </span>
                )}
                {v.transmission && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {v.transmission}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(v.id)}
                disabled={isPending}
                aria-label={`Hapus varian ${v.name}`}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
