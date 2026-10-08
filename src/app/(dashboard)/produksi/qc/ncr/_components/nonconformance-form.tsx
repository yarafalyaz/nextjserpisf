"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { createNonconformance } from "@/actions/qc.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { Button } from "@/components/ui/button"

interface InspectionOption {
  id: number
  documentNo: string
}

const REFERENCE_OPTIONS = [
  { value: "WorkOrder", label: "Perintah Kerja (WO)" },
  { value: "ProductionOrder", label: "Perintah Produksi" },
  { value: "GoodsReceipt", label: "Penerimaan Barang" },
]

const SEVERITY_OPTIONS = [
  { value: "minor", label: "Ringan" },
  { value: "major", label: "Berat" },
  { value: "critical", label: "Kritis" },
]

const RESPONSIBILITY_OPTIONS = [
  { value: "internal", label: "Internal" },
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Pelanggan" },
]

export function NonconformanceForm({ inspections }: { inspections: InspectionOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [referenceType, setReferenceType] = useState("WorkOrder")
  const [severity, setSeverity] = useState("minor")
  const [responsibility, setResponsibility] = useState("internal")
  const [inspectionId, setInspectionId] = useState<number | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("referenceType", referenceType)
    formData.set("severity", severity)
    formData.set("responsibility", responsibility)
    if (inspectionId) formData.set("inspectionId", String(inspectionId))
    else formData.delete("inspectionId")

    startTransition(async () => {
      const result = await createNonconformance(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menyimpan NCR")
        return
      }
      showSuccess("NCR dibuat")
      router.push("/produksi/qc/ncr")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referenceType">Jenis Dokumen *</Label>
          <Select value={referenceType} onValueChange={setReferenceType}>
            <SelectTrigger id="referenceType"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REFERENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="referenceId">ID Dokumen *</Label>
          <Input id="referenceId" name="referenceId" type="number" required placeholder="mis. 123" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="severity">Severity *</Label>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger id="severity"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="responsibility">Penanggung Jawab *</Label>
          <Select value={responsibility} onValueChange={setResponsibility}>
            <SelectTrigger id="responsibility"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESPONSIBILITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="inspection">Inspeksi Terkait (opsional)</Label>
          <Combobox
            id="inspection"
            value={inspectionId ? String(inspectionId) : null}
            onChange={(key) => setInspectionId(key ? Number(key) : null)}
            placeholder="Pilih inspeksi (bila ada)"
            options={inspections.map((i) => ({ value: String(i.id), label: i.documentNo }))}
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="defectDescription">Deskripsi Cacat *</Label>
          <Textarea id="defectDescription" name="defectDescription" rows={3} required placeholder="Jelaskan cacat yang ditemukan" />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="cause">Penyebab</Label>
          <Textarea id="cause" name="cause" rows={2} placeholder="Analisis akar masalah (opsional)" />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} type="button">Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending} id="submit-ncr">
          {isPending ? "Menyimpan..." : "Simpan NCR"}
        </Button>
      </div>
    </form>
  )
}
