"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useMemo } from "react"
import { createQcInspection } from "@/actions/qc.actions"
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
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Button } from "@/components/ui/button"

type ResultValue = "pass" | "fail" | "na"

interface ChecklistItem {
  id: number
  itemName: string
  method: string
  spec: string | null
  isRequired: boolean
}

interface ChecklistOption {
  id: number
  name: string
  checklistType: string
  items: ChecklistItem[]
}

const TYPE_OPTIONS = [
  { value: "incoming", label: "Penerimaan" },
  { value: "in_process", label: "Proses" },
  { value: "final", label: "Akhir" },
]

const REFERENCE_OPTIONS = [
  { value: "WorkOrder", label: "Perintah Kerja (WO)" },
  { value: "ProductionOrder", label: "Perintah Produksi" },
  { value: "GoodsReceipt", label: "Penerimaan Barang" },
]

export function QcInspectionForm({ checklists }: { checklists: ChecklistOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [checklistId, setChecklistId] = useState<number | null>(null)
  const [inspectionType, setInspectionType] = useState("final")
  const [referenceType, setReferenceType] = useState("WorkOrder")
  const [referenceId, setReferenceId] = useState("")
  const [results, setResults] = useState<Record<number, { result: ResultValue; measured: string; note: string }>>({})

  const selectedChecklist = useMemo(
    () => checklists.find((c) => c.id === checklistId) ?? null,
    [checklists, checklistId],
  )

  function setResult(itemId: number, patch: Partial<{ result: ResultValue; measured: string; note: string }>) {
    setResults((prev) => ({
      ...prev,
      [itemId]: { ...{ result: "na" as ResultValue, measured: "", note: "" }, ...prev[itemId], ...patch },
    }))
  }

  const allRequiredAnswered = useMemo(() => {
    if (!selectedChecklist) return false
    return selectedChecklist.items
      .filter((it) => it.isRequired)
      .every((it) => results[it.id]?.result)
  }, [selectedChecklist, results])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedChecklist) {
      showError("Pilih checklist terlebih dahulu")
      return
    }
    if (!referenceId) {
      showError("Isi ID dokumen referensi")
      return
    }

    const formData = new FormData(e.currentTarget)
    formData.set("checklistId", String(selectedChecklist.id))
    formData.set("inspectionType", inspectionType)
    formData.set("referenceType", referenceType)
    formData.set("referenceId", referenceId)

    selectedChecklist.items.forEach((it) => {
      const r = results[it.id]
      if (r?.result) {
        formData.append("resultItemId", String(it.id))
        formData.append("resultValue", r.result)
        formData.append("resultMeasured", r.measured)
        formData.append("resultNote", r.note)
      }
    })

    startTransition(async () => {
      const result = await createQcInspection(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menyimpan inspeksi")
        return
      }
      const ncrCount = result?.raisedNcrIds?.length ?? 0
      if (result?.status === "failed") {
        showSuccess(
          ncrCount > 0
            ? `Inspeksi dicatat: GAGAL — ${ncrCount} NCR dibuat otomatis`
            : "Inspeksi dicatat: GAGAL",
        )
      } else {
        showSuccess("Inspeksi dicatat: LULUS")
      }
      router.push("/produksi/qc/inspeksi")
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="checklist">Checklist *</Label>
          <Combobox
            id="checklist"
            value={checklistId ? String(checklistId) : null}
            onChange={(key) => {
              setChecklistId(key ? Number(key) : null)
              setResults({})
            }}
            placeholder="Pilih checklist dirilis..."
            options={checklists.map((c) => ({ value: String(c.id), label: c.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inspectionType">Jenis Inspeksi *</Label>
          <Select value={inspectionType} onValueChange={setInspectionType}>
            <SelectTrigger id="inspectionType"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          <Input
            id="referenceId"
            type="number"
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            placeholder="mis. 123"
          />
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" name="notes" rows={3} placeholder="Catatan umum inspeksi (opsional)" />
        </div>
      </div>

      {selectedChecklist && (
        <div className="form-section">
          <div className="form-section-header">
            <h3 className="form-section-title">Hasil Pemeriksaan</h3>
          </div>
          <div className="overflow-x-auto">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>Item</DetailTableTh>
                <DetailTableTh>Spesifikasi</DetailTableTh>
                <DetailTableTh>Hasil</DetailTableTh>
                <DetailTableTh>Nilai Ukur</DetailTableTh>
                <DetailTableTh>Catatan</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {selectedChecklist.items.map((it) => {
                  const r = results[it.id]
                  return (
                    <DetailTableRow key={it.id}>
                      <DetailTableTd>
                        {it.itemName}
                        {it.isRequired && <span className="text-danger-600 ml-1">*</span>}
                      </DetailTableTd>
                      <DetailTableTd>{it.spec ?? "-"}</DetailTableTd>
                      <DetailTableTd>
                        <Select
                          value={r?.result ?? "na"}
                          onValueChange={(v) => setResult(it.id, { result: v as ResultValue })}
                        >
                          <SelectTrigger aria-label={`Hasil ${it.itemName}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pass">Lulus</SelectItem>
                            <SelectItem value="fail">Gagal</SelectItem>
                            <SelectItem value="na">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                      </DetailTableTd>
                      <DetailTableTd>
                        <Input
                          value={r?.measured ?? ""}
                          onChange={(e) => setResult(it.id, { measured: e.target.value })}
                          placeholder="Nilai"
                        />
                      </DetailTableTd>
                      <DetailTableTd>
                        <Input
                          value={r?.note ?? ""}
                          onChange={(e) => setResult(it.id, { note: e.target.value })}
                          placeholder="Catatan"
                        />
                      </DetailTableTd>
                    </DetailTableRow>
                  )
                })}
              </DetailTableBody>
            </DetailTable>
          </div>
          {!allRequiredAnswered && (
            <p className="text-xs text-warning-600 mt-2">
              Semua item wajib (*) harus dinilai sebelum menyimpan.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} type="button">Batal</Button>
        <Button
          type="submit"
          variant="primary"
          isDisabled={isPending || !selectedChecklist}
          id="submit-qc-inspection"
        >
          {isPending ? "Menyimpan..." : "Simpan Inspeksi"}
        </Button>
      </div>
    </form>
  )
}
