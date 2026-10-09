"use client"

import { useMemo, useState, useTransition } from "react"
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { showError } from "@/lib/utils/toast"
import { DRIVETRAIN_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/constants/vehicle"
import { checkVehicleFitment } from "@/actions/vehicle-fitment.actions"

interface Option {
  id: number
  name: string
}
interface ModelOption extends Option {
  vehicleBrandId: number
}
interface VariantOption extends Option {
  vehicleModelId: number
}

interface FitmentLine {
  itemId: number
  result: string
  evaluation: { ruleId: number | null; source: string | null; notes: string | null; reason: string }
}

interface FitmentCheckerProps {
  productId: number
  itemNameMap: Record<number, string>
  brands: Option[]
  models: ModelOption[]
  variants: VariantOption[]
}

const RESULT_META: Record<string, { label: string; className: string; Icon: typeof ShieldCheck }> = {
  compatible: { label: "Cocok", className: "text-success", Icon: ShieldCheck },
  incompatible: { label: "Tidak Cocok", className: "text-danger", Icon: ShieldAlert },
  unknown: { label: "Belum Diketahui", className: "text-muted-foreground", Icon: ShieldQuestion },
}

export function FitmentChecker({ productId, itemNameMap, brands, models, variants }: FitmentCheckerProps) {
  const [isPending, startTransition] = useTransition()
  const [brandId, setBrandId] = useState<string | null>(null)
  const [modelId, setModelId] = useState<string | null>(null)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [year, setYear] = useState("")
  const [drivetrain, setDrivetrain] = useState("")
  const [transmission, setTransmission] = useState("")
  const [lines, setLines] = useState<FitmentLine[] | null>(null)

  const modelOptions = useMemo(
    () => (brandId ? models.filter((m) => String(m.vehicleBrandId) === brandId) : models),
    [brandId, models],
  )
  const variantOptions = useMemo(
    () => (modelId ? variants.filter((v) => String(v.vehicleModelId) === modelId) : variants),
    [modelId, variants],
  )

  function check() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set("productId", String(productId))
      if (brandId) formData.set("vehicleBrandId", brandId)
      if (modelId) formData.set("vehicleModelId", modelId)
      if (variantId) formData.set("vehicleVariantId", variantId)
      if (year) formData.set("year", year)
      if (drivetrain) formData.set("drivetrain", drivetrain)
      if (transmission) formData.set("transmission", transmission)

      const res = await checkVehicleFitment(formData)
      if (!res.success) return showError(res.error || "Gagal memeriksa kompatibilitas")
      if (res.mode === "product") setLines(res.lines as FitmentLine[])
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Cek Kompatibilitas Kendaraan</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Periksa apakah BOM produk ini cocok dengan konfigurasi kendaraan (VEH-07).
        </p>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Merek</Label>
            <Combobox
              options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
              value={brandId}
              onChange={(v) => { setBrandId(v); setModelId(null); setVariantId(null) }}
              placeholder="Pilih merek..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Combobox
              options={modelOptions.map((m) => ({ value: String(m.id), label: m.name }))}
              value={modelId}
              onChange={(v) => { setModelId(v); setVariantId(null) }}
              placeholder="Pilih model..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Varian</Label>
            <Combobox
              options={variantOptions.map((v) => ({ value: String(v.id), label: v.name }))}
              value={variantId}
              onChange={setVariantId}
              placeholder="Pilih varian..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tahun</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="mis. 2018" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Penggerak</Label>
            <Combobox
              options={DRIVETRAIN_OPTIONS}
              value={drivetrain || null}
              onChange={(v) => setDrivetrain(v ?? "")}
              placeholder="Pilih..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Transmisi</Label>
            <Combobox
              options={TRANSMISSION_OPTIONS}
              value={transmission || null}
              onChange={(v) => setTransmission(v ?? "")}
              placeholder="Pilih..."
            />
          </div>
        </div>

        <div>
          <Button type="button" variant="primary" onPress={check} isDisabled={isPending}>
            {isPending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            Periksa Kompatibilitas
          </Button>
        </div>

        {lines && (
          <div className="overflow-x-auto">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">BOM produk belum memiliki material.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-default">
                    <th className="text-left py-2 px-2 font-medium text-secondary">Material</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary">Hasil</th>
                    <th className="text-left py-2 px-2 font-medium text-secondary">Sumber / Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const meta = RESULT_META[line.result] ?? RESULT_META.unknown
                    const Icon = meta.Icon
                    return (
                      <tr key={line.itemId} className="border-b border-default/50">
                        <td className="py-2 px-2">{itemNameMap[line.itemId] ?? `Item #${line.itemId}`}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center gap-1.5 font-medium ${meta.className}`}>
                            <Icon size={14} aria-hidden="true" /> {meta.label}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {line.evaluation.source || line.evaluation.reason}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
