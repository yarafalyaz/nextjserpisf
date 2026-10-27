"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { AlertTriangle } from "lucide-react"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { DRIVETRAIN_OPTIONS, TRANSMISSION_OPTIONS } from "@/lib/constants/vehicle"
import {
  createVehicleFitment,
  updateVehicleFitment,
  checkVehicleFitmentConflicts,
} from "@/actions/vehicle-fitment.actions"
import type { FitmentConflict as VehicleFitmentConflict } from "@/lib/services/vehicle-fitment.service"

export const FITMENT_RESULT_LABEL: Record<string, string> = {
  compatible: "Cocok",
  incompatible: "Tidak Cocok",
  unknown: "Belum Diketahui",
}

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

interface FitmentFormProps {
  items: { id: number; sku: string; name: string }[]
  brands: Option[]
  models: ModelOption[]
  variants: VariantOption[]
  rule?: {
    id: number
    itemId: number
    vehicleBrandId: number | null
    vehicleModelId: number | null
    vehicleVariantId: number | null
    yearFrom: number | null
    yearTo: number | null
    drivetrain: string | null
    transmission: string | null
    result: string
    source: string | null
    notes: string | null
    isActive: boolean
  }
}

export function VehicleFitmentForm({ items, brands, models, variants, rule }: FitmentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [itemId, setItemId] = useState<string | null>(rule ? String(rule.itemId) : null)
  const [brandId, setBrandId] = useState<string | null>(rule?.vehicleBrandId ? String(rule.vehicleBrandId) : null)
  const [modelId, setModelId] = useState<string | null>(rule?.vehicleModelId ? String(rule.vehicleModelId) : null)
  const [variantId, setVariantId] = useState<string | null>(rule?.vehicleVariantId ? String(rule.vehicleVariantId) : null)
  const [drivetrain, setDrivetrain] = useState(rule?.drivetrain ?? "")
  const [transmission, setTransmission] = useState(rule?.transmission ?? "")
  const [result, setResult] = useState(rule?.result ?? "unknown")
  const [yearFrom, setYearFrom] = useState(rule?.yearFrom != null ? String(rule.yearFrom) : "")
  const [yearTo, setYearTo] = useState(rule?.yearTo != null ? String(rule.yearTo) : "")
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)
  const [conflicts, setConflicts] = useState<VehicleFitmentConflict[]>([])

  const buildScopeFormData = useCallback(() => {
    const formData = new FormData()
    if (itemId) formData.set("itemId", itemId)
    if (brandId) formData.set("vehicleBrandId", brandId)
    if (modelId) formData.set("vehicleModelId", modelId)
    if (variantId) formData.set("vehicleVariantId", variantId)
    if (yearFrom) formData.set("yearFrom", yearFrom)
    if (yearTo) formData.set("yearTo", yearTo)
    if (drivetrain) formData.set("drivetrain", drivetrain)
    if (transmission) formData.set("transmission", transmission)
    formData.set("result", result)
    return formData
  }, [itemId, brandId, modelId, variantId, yearFrom, yearTo, drivetrain, transmission, result])

  // F-2026-10-21-025: peringatan aturan berlawanan dari kontrak backend
  // (checkVehicleFitmentConflicts) — peringatan saja, simpan tidak diblokir.
  useEffect(() => {
    if (!itemId || !isActive) return
    const timer = setTimeout(async () => {
      const formData = buildScopeFormData()
      if (rule?.id) formData.set("excludeRuleId", String(rule.id))
      try {
        const res = await checkVehicleFitmentConflicts(formData)
        setConflicts(res.success ? (res.conflicts ?? []) : [])
      } catch {
        // Gagal cek konflik tidak boleh mematikan form: kosongkan peringatan.
        setConflicts([])
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [buildScopeFormData, itemId, isActive, rule?.id])

  // Cascade the scope selectors so only consistent combinations are offered.
  const modelOptions = useMemo(
    () => (brandId ? models.filter((m) => String(m.vehicleBrandId) === brandId) : models),
    [brandId, models],
  )
  const variantOptions = useMemo(
    () => (modelId ? variants.filter((v) => String(v.vehicleModelId) === modelId) : variants),
    [modelId, variants],
  )

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!itemId) return showError("Item wajib dipilih")

    startTransition(async () => {
      const formData = buildScopeFormData()
      const source = (e.currentTarget.elements.namedItem("source") as HTMLTextAreaElement | null)?.value
      const notes = (e.currentTarget.elements.namedItem("notes") as HTMLTextAreaElement | null)?.value
      if (source) formData.set("source", source)
      if (notes) formData.set("notes", notes)
      formData.set("isActive", isActive ? "true" : "false")

      const res = rule?.id
        ? await updateVehicleFitment(rule.id, formData)
        : await createVehicleFitment(formData)

      if (!res.success) return showError(res.error || "Gagal menyimpan aturan fitment")
      showSuccess(rule?.id ? "Aturan fitment diperbarui" : "Aturan fitment ditambahkan")
      router.push("/kendaraan/fitment")
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={rule?.id ? "Formulir ubah aturan fitment" : "Formulir tambah aturan fitment"}>
      {isActive && itemId && conflicts.length > 0 ? (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">Peringatan: aturan berlawanan ditemukan.</p>
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c.ruleId}>
                  Aturan #{c.ruleId}: {FITMENT_RESULT_LABEL[c.conflictResult] ?? c.conflictResult}
                  {c.scope.vehicleBrandId != null ? `, merek #${c.scope.vehicleBrandId}` : ""}
                  {c.scope.vehicleModelId != null ? `, model #${c.scope.vehicleModelId}` : ""}
                  {c.scope.vehicleVariantId != null ? `, varian #${c.scope.vehicleVariantId}` : ""}
                  {c.source ? ` — ${c.source}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1">Simpan tetap bisa dilanjutkan.</p>
          </div>
        </div>
      ) : null}
      <FormCard>
        <FormSection title="Item & Cakupan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemId">Item / SKU <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Combobox
              id="itemId"
              options={items.map((i) => ({ value: String(i.id), label: `${i.sku} - ${i.name}` }))}
              value={itemId}
              onChange={setItemId}
              placeholder="Cari item..."
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleBrandId">Merek</Label>
            <Combobox
              id="vehicleBrandId"
              options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
              value={brandId}
              onChange={(v) => { setBrandId(v); setModelId(null); setVariantId(null) }}
              placeholder="Semua merek..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleModelId">Model</Label>
            <Combobox
              id="vehicleModelId"
              options={modelOptions.map((m) => ({ value: String(m.id), label: m.name }))}
              value={modelId}
              onChange={(v) => { setModelId(v); setVariantId(null) }}
              placeholder="Semua model..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vehicleVariantId">Varian</Label>
            <Combobox
              id="vehicleVariantId"
              options={variantOptions.map((v) => ({ value: String(v.id), label: v.name }))}
              value={variantId}
              onChange={setVariantId}
              placeholder="Semua varian..."
            />
          </div>
        </FormSection>

        <FormSection title="Batasan & Hasil">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yearFrom">Tahun Dari</Label>
            <Input id="yearFrom" type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="mis. 2015" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="yearTo">Tahun Sampai</Label>
            <Input id="yearTo" type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="mis. 2020" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="drivetrain">Penggerak</Label>
            <Combobox
              id="drivetrain"
              options={DRIVETRAIN_OPTIONS}
              value={drivetrain || null}
              onChange={(v) => setDrivetrain(v ?? "")}
              placeholder="Pilih..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transmission">Transmisi</Label>
            <Combobox
              id="transmission"
              options={TRANSMISSION_OPTIONS}
              value={transmission || null}
              onChange={(v) => setTransmission(v ?? "")}
              placeholder="Pilih..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="result">Hasil <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Combobox
              id="result"
              options={[
                { value: "compatible", label: "Cocok" },
                { value: "incompatible", label: "Tidak Cocok" },
                { value: "unknown", label: "Belum Diketahui" },
              ]}
              value={result}
              onChange={(v) => setResult(v ?? "unknown")}
            />
          </div>
          <div className="flex items-center gap-2">
            <input id="isActive" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4 rounded border-default" />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
        </FormSection>

        <FormSection title="Sumber & Catatan" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source">Sumber</Label>
            <Textarea id="source" name="source" rows={2} defaultValue={rule?.source ?? ""} placeholder="Sumber/versi aturan (mis. katalog pabrikan 2024)" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={rule?.notes ?? ""} placeholder="Catatan..." />
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : rule?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
