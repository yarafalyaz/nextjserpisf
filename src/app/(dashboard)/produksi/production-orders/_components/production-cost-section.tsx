"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Pencil } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatCurrency } from "@/lib/utils/format"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import {
  createProductionCost,
  updateProductionCost,
  deleteProductionCost,
  pullLaborCostFromTimesheets,
  applyOverheadToProductionOrder,
} from "@/actions/production-cost.actions"
import Link from "next/link"
import { OVERHEAD_DRIVER_LABELS } from "@/lib/validations/production-cost.schemas"

const CATEGORY_OPTIONS = [
  { value: "labor", label: "Tenaga kerja" },
  { value: "machine", label: "Mesin" },
  { value: "overhead", label: "Overhead" },
  { value: "subcontract", label: "Subkontrak" },
  { value: "service", label: "Jasa" },
  { value: "rework", label: "Pengerjaan Ulang" },
  { value: "other", label: "Lain-lain" },
]

const DRIVER_OPTIONS = Object.entries(OVERHEAD_DRIVER_LABELS).map(([value, label]) => ({ value, label }))

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

export interface ProductionCostRow {
  id: number
  category: string
  description: string | null
  hours: number | null
  rate: number | null
  amount: number
  referenceNo: string | null
  vendorId: number | null
  sourceTimesheetId: number | null
  vendorName: string | null
  purchaseOrderId?: number | null
  purchaseOrderNo?: string | null
  nonconformanceId?: number | null
  nonconformanceNo?: string | null
}

export function ProductionCostSection({
  productionOrderId,
  workOrderId,
  costs,
  canManage,
  hasProject,
}: {
  productionOrderId: number
  workOrderId: number | null
  costs: ProductionCostRow[]
  canManage: boolean
  hasProject: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState("labor")
  const [hours, setHours] = useState("")
  const [rate, setRate] = useState<number | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  // Baris yang sedang disunting; null = mode tambah. Wajib diisi lengkap saat menyimpan,
  // karena updateProductionCost menulis SEMUA field (yang kosong menjadi null).
  const [editing, setEditing] = useState<ProductionCostRow | null>(null)

  // Driver-based overhead application (PRD FAB-07).
  const [overheadOpen, setOverheadOpen] = useState(false)
  const [driverType, setDriverType] = useState("machine_hours")
  const [driverQty, setDriverQty] = useState("")
  const [driverRate, setDriverRate] = useState<number | null>(null)

  const total = costs.reduce((s, c) => s + c.amount, 0)
  const overheadPreview =
    Number.isFinite(Number(driverQty)) && driverRate !== null && driverQty !== ""
      ? Math.round(Number(driverQty) * driverRate * 100) / 100
      : 0

  // Auto-derive amount from hours × rate while the user types, unless they
  // typed an explicit amount (which always wins).
  function derivedAmount(): number | null {
    const h = Number(hours)
    if (hours === "" || rate === null || !Number.isFinite(h)) return amount
    return Math.round(h * rate * 100) / 100
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("productionOrderId", String(productionOrderId))
    formData.set("category", category)
    if (workOrderId) formData.set("workOrderId", String(workOrderId))
    if (amount === null && hours !== "" && rate !== null) {
      formData.set("amount", String(derivedAmount() ?? 0))
    }

    startTransition(async () => {
      const result = editing
        ? await updateProductionCost(editing.id, formData)
        : await createProductionCost(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menyimpan biaya")
        return
      }
      showSuccess(editing ? "Biaya produksi diperbarui" : "Biaya produksi ditambahkan")
      setOpen(false)
      setEditing(null)
      setCategory("labor")
      setHours("")
      setRate(null)
      setAmount(null)
      router.refresh()
    })
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      const result = await deleteProductionCost(id)
      if (result && !result.success) {
        showError(result.error || "Gagal menghapus biaya")
        return
      }
      showSuccess("Biaya produksi dihapus")
      router.refresh()
    })
  }

  function startEdit(c: ProductionCostRow) {
    setEditing(c)
    setOpen(true)
    setCategory(c.category)
    setHours(c.hours != null ? String(c.hours) : "")
    setRate(c.rate ?? null)
    setAmount(c.amount)
  }

  function handleApplyOverhead(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData()
    formData.set("productionOrderId", String(productionOrderId))
    formData.set("driverType", driverType)
    formData.set("driverQty", driverQty)
    formData.set("rate", driverRate === null ? "" : String(driverRate))
    startTransition(async () => {
      const result = await applyOverheadToProductionOrder(formData)
      if (result && !result.success) {
        showError(result.error || "Gagal menerapkan overhead")
        return
      }
      showSuccess(`Overhead ${formatCurrency((result as { amount?: number }).amount ?? 0)} diterapkan`)
      setOverheadOpen(false)
      setDriverQty("")
      setDriverRate(null)
      router.refresh()
    })
  }

  function handlePullLabor() {
    if (!workOrderId) {
      showError("Perintah produksi belum tertaut ke perintah kerja.")
      return
    }
    const rateNum = rate ?? 0
    if (rate === null || rateNum <= 0) {
      showError("Isi tarif per jam terlebih dahulu.")
      return
    }
    startTransition(async () => {
      const result = await pullLaborCostFromTimesheets(workOrderId, productionOrderId, rateNum)
      if (result && !result.success) {
        showError(result.error || "Gagal menarik lembar waktu")
        return
      }
      showSuccess(`Ditarik ${result.count} lembar waktu → ${formatCurrency(result.added ?? 0)}`)
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Biaya Non-Bahan (Tenaga Kerja / Overhead / Subkontrak)
        </h2>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button onPress={() => setOverheadOpen((v) => !v)} type="button" aria-label="Terapkan overhead">
              Terapkan Overhead
            </Button>
            <Button onPress={() => setOpen((v) => !v)} type="button" aria-label="Tambah biaya">
              <Plus size={14} /> Tambah Biaya
            </Button>
          </div>
        )}
      </div>

      {overheadOpen && canManage && (
        <form onSubmit={handleApplyOverhead} className="p-4 px-5 border-b border-default bg-surface-secondary">
          <p className="mb-3 text-xs text-muted-foreground">
            Overhead yang diterapkan = kuantitas pemicu × tarif. Dasar alokasi dicatat untuk audit (FAB-07).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driverType">Dasar Alokasi *</Label>
              <Select value={driverType} onValueChange={setDriverType}>
                <SelectTrigger id="driverType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRIVER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driverQty">Kuantitas Pemicu *</Label>
              <Input id="driverQty" name="driverQty" type="number" step="0.01" min="0" value={driverQty} onChange={(e) => setDriverQty(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="driverRate">Tarif per Pemicu (Rp) *</Label>
              <CurrencyInput id="driverRate" name="rate" prefix="Rp" value={driverRate} onChange={setDriverRate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Overhead Diterapkan</Label>
              <div className="flex h-9 items-center rounded-md border border-default px-3 text-sm font-semibold">
                {formatCurrency(overheadPreview)}
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-4">
            <Button className="w-full sm:w-auto" type="button" isDisabled={isPending} onPress={() => setOverheadOpen(false)}>
              Batal
            </Button>
            <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending || overheadPreview <= 0} id="submit-overhead">
              {isPending ? "Menyimpan..." : "Terapkan Overhead"}
            </Button>
          </div>
        </form>
      )}

      {open && canManage && (
        <form key={editing?.id ?? "new"} onSubmit={handleSubmit} className="p-4 px-5 border-b border-default bg-surface-secondary">
          <input type="hidden" name="vendorId" defaultValue={editing?.vendorId ?? ""} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Kategori *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hours">Jam</Label>
              <Input id="hours" name="hours" type="number" step="0.01" min="0" value={hours} onChange={(e) => setHours(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rate">Tarif / Jam</Label>
              <CurrencyInput id="rate" name="rate" prefix="Rp" value={rate} onChange={setRate} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Jumlah (Rp) *</Label>
              <CurrencyInput
                id="amount"
                name="amount"
                prefix="Rp"
                value={amount ?? derivedAmount()}
                onChange={setAmount}
              />
              <p className="text-xs text-muted-foreground">Terisi otomatis dari Jam × Tarif bila dikosongkan.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="referenceNo">No. Referensi</Label>
              <Input id="referenceNo" name="referenceNo" defaultValue={editing?.referenceNo ?? ""} placeholder="mis. tagihan pemasok" />
            </div>
            <div className="flex flex-col gap-1.5 col-span-full">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={editing?.description ?? ""} placeholder="Keterangan biaya (opsional)" />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-4">
            {category === "labor" && workOrderId && (
              <Button className="w-full sm:w-auto"
                type="button"
                isDisabled={isPending || !hasProject}
                onPress={handlePullLabor}
                aria-label="Tarik dari lembar waktu"
              >
                Tarik dari Lembar Waktu
              </Button>
            )}
            {editing && (
              <Button className="w-full sm:w-auto" type="button" isDisabled={isPending} onPress={() => { setEditing(null); setOpen(false) }}>
                Batal
              </Button>
            )}
            <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending} id="submit-production-cost">
              {isPending ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan Biaya"}
            </Button>
          </div>
        </form>
      )}

      <div className="p-4 px-5">
        {costs.length === 0 ? (
          <EmptyState title="Belum ada biaya non-bahan." description="HPP saat ini hanya dari bahan." className="py-10" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kategori</DetailTableTh>
              <DetailTableTh>Deskripsi</DetailTableTh>
              <DetailTableTh align="right">Jam</DetailTableTh>
              <DetailTableTh align="right">Tarif</DetailTableTh>
              <DetailTableTh align="right">Jumlah</DetailTableTh>
              <DetailTableTh>Sumber</DetailTableTh>
              {canManage && <DetailTableTh>Aksi</DetailTableTh>}
            </DetailTableHead>
            <DetailTableBody>
              {costs.map((c) => (
                <DetailTableRow key={c.id}>
                  <DetailTableTd>{CATEGORY_LABELS[c.category] ?? c.category}</DetailTableTd>
                  <DetailTableTd>{c.description ?? "-"}</DetailTableTd>
                  <DetailTableTd align="right">{c.hours ?? "-"}</DetailTableTd>
                  <DetailTableTd align="right">{c.rate != null ? formatCurrency(c.rate) : "-"}</DetailTableTd>
                  <DetailTableTd align="right">{formatCurrency(c.amount)}</DetailTableTd>
                  <DetailTableTd>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {c.sourceTimesheetId ? (
                        <span>Lembar Waktu</span>
                      ) : c.vendorName ? (
                        <span>{c.vendorName}</span>
                      ) : null}
                      {c.purchaseOrderId != null && (
                        <Link href={`/pembelian/pesanan/${c.purchaseOrderId}`} className="text-primary hover:underline">
                          PO {c.purchaseOrderNo ?? `#${c.purchaseOrderId}`}
                        </Link>
                      )}
                      {c.nonconformanceId != null && (
                        <Link href={`/produksi/qc/ncr/${c.nonconformanceId}`} className="text-primary hover:underline">
                          NCR {c.nonconformanceNo ?? `#${c.nonconformanceId}`}
                        </Link>
                      )}
                      {!c.sourceTimesheetId && !c.vendorName && c.purchaseOrderId == null && c.nonconformanceId == null && "-"}
                    </span>
                  </DetailTableTd>
                  {canManage && (
                    <DetailTableTd>
                      <Button
                        onPress={() => startEdit(c)}
                        aria-label="Ubah biaya"
                        type="button"
                        isDisabled={isPending}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        onPress={() => handleDelete(c.id)}
                        aria-label="Hapus biaya"
                        type="button"
                        isDisabled={isPending}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </DetailTableTd>
                  )}
                </DetailTableRow>
              ))}
              <DetailTableRow>
                <DetailTableTd><span className="font-semibold">Total non-bahan</span></DetailTableTd>
                <DetailTableTd>{" "}</DetailTableTd>
                <DetailTableTd align="right">{" "}</DetailTableTd>
                <DetailTableTd align="right">{" "}</DetailTableTd>
                <DetailTableTd align="right"><span className="font-semibold">{formatCurrency(total)}</span></DetailTableTd>
                <DetailTableTd>{" "}</DetailTableTd>
                {canManage && <DetailTableTd>{" "}</DetailTableTd>}
              </DetailTableRow>
            </DetailTableBody>
          </DetailTable>
        )}
      </div>
    </div>
  )
}
