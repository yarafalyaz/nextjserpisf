"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, PackageMinus, Flag } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"
import {
  confirmProductionOrder,
  issueMaterial,
  completeProductionOrder,
} from "@/actions/manufacturing.actions"

interface Props {
  orderId: number
  status: string
  // items selectable for material issue (id + label)
  items: { id: number; label: string }[]
}

export function ProductionOrderActions({ orderId, status, items }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [issueItemId, setIssueItemId] = useState<string | null>(null)
  const [issueQty, setIssueQty] = useState("")

  function doConfirm() {
    startTransition(async () => {
      const res = await confirmProductionOrder(orderId)
      if (!res.success) return showError(res.error || "Gagal mengonfirmasi")
      showSuccess("Perintah produksi dikonfirmasi")
      setConfirmOpen(false)
      router.refresh()
    })
  }

  function doComplete() {
    startTransition(async () => {
      const res = await completeProductionOrder(orderId)
      if (!res.success) return showError(res.error || "Gagal menyelesaikan")
      const variance = "variance" in res ? res.variance : 0
      showSuccess(`Selesai. Varians: ${variance.toLocaleString("id-ID")}`)
      setCompleteOpen(false)
      router.refresh()
    })
  }

  function doIssue() {
    const itemId = Number(issueItemId)
    const qty = Number(issueQty)
    if (!itemId || qty <= 0) return showError("Pilih item dan isi qty > 0")
    startTransition(async () => {
      const res = await issueMaterial(orderId, [{ itemId, qty }])
      if (!res.success) return showError(res.error || "Gagal mengeluarkan material")
      showSuccess("Material dikeluarkan")
      setIssueOpen(false)
      setIssueItemId(null)
      setIssueQty("")
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
          <PackageMinus size={14} aria-hidden="true" /> Keluarkan Material
        </Button>
      )}
      {status === "in_progress" && (
        <Button type="button" size="sm" onClick={() => setCompleteOpen(true)} disabled={isPending}>
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
      />

      {/* Issue-material mini dialog: custom content via children */}
      <ConfirmDialog
        isOpen={issueOpen}
        onOpenChange={setIssueOpen}
        title="Keluarkan Material"
        confirmLabel="Keluarkan"
        cancelLabel="Batal"
        variant="accent"
        isPending={isPending}
        onConfirm={doIssue}
      >
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueItem">Item</Label>
            <Combobox
              id="issueItem"
              options={items.map((i) => ({ value: String(i.id), label: i.label }))}
              value={issueItemId}
              onChange={setIssueItemId}
              placeholder="Pilih item..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issueQty">Qty</Label>
            <Input id="issueQty" type="number" min="0" step="0.01" value={issueQty} onChange={(e) => setIssueQty(e.target.value)} placeholder="0" />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
