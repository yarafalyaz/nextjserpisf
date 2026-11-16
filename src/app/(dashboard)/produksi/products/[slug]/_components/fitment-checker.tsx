"use client"

import { useMemo, useState, useTransition } from "react"
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from "@/components/ui/fontawesome-icons"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
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

type FitmentTableRow = FitmentLine & { id: number }

const fitmentColumnHelper = createColumnHelper<FitmentTableRow>()

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

  const tableData = useMemo<FitmentTableRow[]>(
    () => (lines ?? []).map((line) => ({ ...line, id: line.itemId })),
    [lines],
  )

  const columns = useMemo(
    () => [
      fitmentColumnHelper.accessor("itemId", {
        header: "Bahan",
        meta: { mobilePrimary: true },
        cell: (info) => (
          <span className="font-medium text-foreground">
            {itemNameMap[info.getValue()] ?? `Barang #${info.getValue()}`}
          </span>
        ),
      }),
      fitmentColumnHelper.accessor("result", {
        header: "Hasil",
        cell: (info) => {
          const meta = RESULT_META[info.getValue()] ?? RESULT_META.unknown
          const Icon = meta.Icon
          return (
            <span className={`inline-flex items-center gap-1.5 font-medium ${meta.className}`}>
              <Icon size={14} aria-hidden="true" /> {meta.label}
            </span>
          )
        },
      }),
      fitmentColumnHelper.accessor("evaluation", {
        header: "Sumber / Alasan",
        cell: (info) => {
          const ev = info.getValue()
          return (
            <span className="text-muted-foreground">{ev.source || ev.reason}</span>
          )
        },
      }),
    ],
    [itemNameMap],
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
            <Label htmlFor="fitment-brand">Merek</Label>
            <Combobox
              id="fitment-brand"
              options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
              value={brandId}
              onChange={(v) => { setBrandId(v); setModelId(null); setVariantId(null) }}
              placeholder="Pilih merek..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fitment-model">Model</Label>
            <Combobox
              id="fitment-model"
              options={modelOptions.map((m) => ({ value: String(m.id), label: m.name }))}
              value={modelId}
              onChange={(v) => { setModelId(v); setVariantId(null) }}
              placeholder="Pilih model..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fitment-variant">Varian</Label>
            <Combobox
              id="fitment-variant"
              options={variantOptions.map((v) => ({ value: String(v.id), label: v.name }))}
              value={variantId}
              onChange={setVariantId}
              placeholder="Pilih varian..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fitment-year">Tahun</Label>
            <Input id="fitment-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="mis. 2018" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fitment-drivetrain">Penggerak</Label>
            <Combobox
              id="fitment-drivetrain"
              options={DRIVETRAIN_OPTIONS}
              value={drivetrain || null}
              onChange={(v) => setDrivetrain(v ?? "")}
              placeholder="Pilih..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fitment-transmission">Transmisi</Label>
            <Combobox
              id="fitment-transmission"
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
          <div>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">BOM produk belum memiliki bahan.</p>
            ) : (
              <DataTable
                data={tableData}
                columns={columns}
                ariaLabel="Hasil Cek Kompatibilitas Kendaraan"
                selectable={false}
                enableColumnToggle={false}
                enableExport={false}
                pageSize={50}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
