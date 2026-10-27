"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, PackageMinus, Play, Flag } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import {
  confirmProductionOrder,
  issueMaterial,
  completeProductionOrder,
  startProductionOrder,
} from "@/actions/manufacturing.actions"
import {
  SCRAP_REASON_CODES,
  SCRAP_REASON_LABELS,
  validateScrapInput,
} from "@/lib/services/scrap-classification"

export function buildIssueMaterialArgs(input: {
  itemId: number
  qty: number
  scrapQty?: number
  scrapReasonCode?: string | null
  scrapNote?: string | null
}): { itemId: number; qty: number; scrapQty: number; scrapReasonCode: string | null; scrapNote: string | null } {
  const scrapQty = Number(input.scrapQty ?? 0)
  const scrapReasonCode = input.scrapReasonCode?.trim() ? input.scrapReasonCode : null
  const scrapNote = input.scrapNote?.trim() ? input.scrapNote : null
  const err = validateScrapInput({
    issueQty: input.qty,
    scrapQty,
    scrapReasonCode,
    scrapNote,
  })
  if (err) throw new Error(err)
  return { itemId: input.itemId, qty: input.qty, scrapQty, scrapReasonCode, scrapNote }
}

interface Props {
  orderId: number
  status: string
  // items selectable for material issue (id + label)
  items: { id: number; label: string }[]
  outputQty: number
  outputTracksSerial: boolean
  /** Units already released to stock (for partial completion, FAB-09). */
  completedQty?: number
}

export function ProductionOrderActions({ orderId, status, items, outputQty, outputTracksSerial, completedQty = 0 }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueItemId, setIssueItemId] = useState<string | null>(null)
  const [issueQty, setIssueQty] = useState("")
  const [issueScrapQty, setIssueScrapQty] = useState("")
  const [issueScrapReasonCode, setIssueScrapReasonCode] = useState<string | null>(null)
  const [issueScrapNote, setIssueScrapNote] = useState("")
  const [serialNumbersText, setSerialNumbersText] = useState("")
  const remainingQty = Math.max(0, outputQty - completedQty)
  const [completeQty, setCompleteQty] = useState("")

  function doConfirm() {
    startTransition(async () => {
      const res = await confirmProductionOrder(orderId)
      if (!res.success) return showError(res.error || "Gagal mengonfirmasi")
      showSuccess("Perintah produksi dikonfirmasi")
      setConfirmOpen(false)
      router.refresh()
    })
  }

  function doStart() {
    startTransition(async () => {
      const res = await startProductionOrder(orderId)
      if (!res.success) return showError(res.error || "Gagal memulai")
      showSuccess("Perintah produksi dimulai")
      router.refresh()
    })
  }

  function openComplete() {
    setCompleteQty(String(remainingQty))
    setCompleteOpen(true)
  }

  function doComplete() {
    const serialNumbers = serialNumbersText
      .split(/[\n,]+/)
      .map((serial) => serial.trim())
      .filter(Boolean)
    const qty = completeQty === "" ? undefined : Number(completeQty)
    if (qty !== undefined && (!Number.isFinite(qty) || qty <= 0)) {
      return showError("Kuantitas yang diselesaikan harus lebih dari 0")
    }
    startTransition(async () => {
      const res = await completeProductionOrder(orderId, serialNumbers, qty)
      if (!res.success) return showError(res.error || "Gagal menyelesaikan")
      if ("isFinal" in res && !res.isFinal) {
        showSuccess(`Diselesaikan parsial: ${qty} unit. Sisa ${Math.round(((remainingQty - (qty ?? 0)) * 100)) / 100} unit tetap WIP.`)
      } else {
        const variance = "variance" in res ? res.variance : 0
        showSuccess(`Selesai. Varians: ${variance.toLocaleString("id-ID")}`)
      }
      setCompleteOpen(false)
      setSerialNumbersText("")
      setCompleteQty("")
      router.refresh()
    })
  }

  function doIssue() {
    const itemId = Number(issueItemId)
    const qty = Number(issueQty)
    if (!itemId || qty <= 0) return showError("Pilih barang dan isi qty > 0")
    let args: ReturnType<typeof buildIssueMaterialArgs>
    try {
      args = buildIssueMaterialArgs({
        itemId,
        qty,
        scrapQty: issueScrapQty === "" ? 0 : Number(issueScrapQty),
        scrapReasonCode: issueScrapReasonCode,
        scrapNote: issueScrapNote,
      })
    } catch (e) {
      return showError(e instanceof Error ? e.message : "Data scrap tidak valid")
    }
    startTransition(async () => {
      const res = await issueMaterial(orderId, [args])
      if (!res.success) return showError(res.error || "Gagal mengeluarkan bahan")
      showSuccess("Bahan dikeluarkan")
      setIssueOpen(false)
      setIssueItemId(null)
      setIssueQty("")
      setIssueScrapQty("")
      setIssueScrapReasonCode(null)
      setIssueScrapNote("")
      router.refresh()
    })
  }

  return (
    <div className="flex gap-2">
      {status === "draft" && (
        <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={isPending}>
          <CheckCircle2 size={14} aria-hidden="true" /> Konfirmasi
        </Button>
      )}
      {(status === "confirmed" || status === "in_progress") && (
        <Button type="button" size="sm" variant="secondary" onClick={() => setIssueOpen(true)} disabled={isPending}>
          <PackageMinus size={14} aria-hidden="true" /> Keluarkan Bahan
        </Button>
      )}
      {status === "confirmed" && (
        <Button type="button" size="sm" onClick={doStart} disabled={isPending}>
          <Play size={14} aria-hidden="true" /> Mulai Produksi
        </Button>
      )}
      {status === "in_progress" && (
        <Button type="button" size="sm" onClick={openComplete} disabled={isPending}>
          <Flag size={14} aria-hidden="true" /> Selesaikan
        </Button>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Konfirmasi perintah produksi?"
        body="Setelah dikonfirmasi, perintah tidak bisa diedit dan material dapat dikeluarkan."
        confirmLabel="Konfirmasi"
        cancelLabel="Batal"
        variant="accent"
        isPending={isPending}
        onConfirm={doConfirm}
      />

      <ConfirmDialog
        isOpen={completeOpen}
        onOpenChange={setCompleteOpen}
        title="Selesaikan perintah produksi?"
        body="Varians (biaya aktual − standar) akan dihitung dan perintah ditandai selesai."
        confirmLabel="Selesaikan"
        cancelLabel="Batal"
        variant="accent"
        isPending={isPending}
        onConfirm={doComplete}
      >
        <div className="space-y-2">
          <p>Hasil produksi akan masuk ke persediaan dan biaya dipindahkan dari WIP.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="completeQty">Kuantitas diselesaikan (sudah: {completedQty}, sisa: {remainingQty})</Label>
            <Input
              id="completeQty"
              type="number"
              min="0"
              max={remainingQty}
              step="0.01"
              value={completeQty}
              onChange={(event) => setCompleteQty(event.target.value)}
              placeholder={String(remainingQty)}
            />
            <p className="text-xs text-muted-foreground">
              Kurangi nilainya untuk menyelesaikan sebagian; sisanya tetap WIP (produksi parsial).
            </p>
          </div>
          {outputTracksSerial && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="productionSerials">Nomor seri ({(completeQty === "" ? remainingQty : Number(completeQty)) || 0} baris)</Label>
              <Textarea
                id="productionSerials"
                value={serialNumbersText}
                onChange={(event) => setSerialNumbersText(event.target.value)}
                placeholder="Satu nomor seri per baris"
                rows={Math.min(Math.max(outputQty, 3), 8)}
              />
            </div>
          )}
        </div>
      </ConfirmDialog>

      {/* Issue-material mini dialog: custom content via children */}
      <ConfirmDialog
        isOpen={issueOpen}
        onOpenChange={setIssueOpen}
        title="Keluarkan Bahan"
        confirmLabel="Keluarkan"
        cancelLabel="Batal"
        variant="accent"
        isPending={isPending}
        onConfirm={doIssue}
      >
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueItem">Barang</Label>
            <Combobox
              id="issueItem"
              options={items.map((i) => ({ value: String(i.id), label: i.label }))}
              value={issueItemId}
              onChange={setIssueItemId}
              placeholder="Pilih barang..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueQty">Kuantitas</Label>
            <Input id="issueQty" type="number" min="0" step="0.01" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueScrapQty">Qty Scrap</Label>
            <Input id="issueScrapQty" type="number" min="0" step="0.01" value={issueScrapQty} onChange={(e) => setIssueScrapQty(e.target.value)} placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueScrapReason">Alasan Scrap</Label>
            <Combobox
              id="issueScrapReason"
              options={SCRAP_REASON_CODES.map((code) => ({ value: code, label: SCRAP_REASON_LABELS[code] }))}
              value={issueScrapReasonCode}
              onChange={setIssueScrapReasonCode}
              placeholder="— Tanpa scrap —"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueScrapNote">Catatan Scrap</Label>
            <Input id="issueScrapNote" value={issueScrapNote} onChange={(e) => setIssueScrapNote(e.target.value)} placeholder={issueScrapReasonCode === "lainnya" ? "Wajib diisi" : "Opsional"} />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
