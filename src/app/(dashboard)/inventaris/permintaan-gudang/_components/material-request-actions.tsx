"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  submitMaterialRequest,
  approveMaterialRequest,
  rejectMaterialRequest,
  cancelMaterialRequest,
  closeMaterialRequest,
  createTransferFromMaterialRequest,
} from "@/actions/material-request.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

type ReasonKind = "reject" | "cancel" | "close"

const REASON_CONFIG: Record<ReasonKind, { title: string; confirmLabel: string; label: string }> = {
  reject: { title: "Tolak permintaan ini?", confirmLabel: "Tolak", label: "Alasan penolakan" },
  cancel: { title: "Batalkan permintaan ini?", confirmLabel: "Batalkan", label: "Alasan pembatalan" },
  close: { title: "Tutup sisa permintaan ini?", confirmLabel: "Tutup Sisa Permintaan", label: "Alasan penutupan" },
}

interface MaterialRequestActionsProps {
  id: number
  status: string
  /** Izin approve_material_requests (dihitung server di halaman detail). */
  canApprove: boolean
  /** Izin edit_material_requests. */
  canEdit: boolean
  /** Izin create_inventory_transfers; tombol Buat Transfer hanya status disetujui/terpenuhi sebagian. */
  canCreateTransfer: boolean
}

export function MaterialRequestActions({ id, status, canApprove, canEdit, canCreateTransfer }: MaterialRequestActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmKind, setConfirmKind] = useState<"submit" | "approve" | "transfer" | null>(null)
  const [reasonKind, setReasonKind] = useState<ReasonKind | null>(null)
  const [reason, setReason] = useState("")

  function run(action: () => Promise<{ success: boolean; error?: string }>, successMessage: string, close: () => void) {
    startTransition(async () => {
      try {
        const result = await action()
        if (result && !result.success) { showError(result.error || "Gagal memproses data"); close(); return }
        showSuccess(successMessage)
        close()
        router.refresh()
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e
        showError(e instanceof Error ? e.message : "Gagal memproses data")
        close()
      }
    })
  }

  const showSubmit = canEdit && status === "draft"
  const showApprove = canApprove && status === "diajukan"
  const showCancel = canEdit && (status === "draft" || status === "diajukan")
  const showClose = canApprove && (status === "disetujui" || status === "terpenuhi_sebagian")
  const showTransfer = canCreateTransfer && (status === "disetujui" || status === "terpenuhi_sebagian")

  if (!showSubmit && !showApprove && !showCancel && !showClose && !showTransfer) return null

  return (
    <>
      {showSubmit && (
        <Button variant="primary" onPress={() => setConfirmKind("submit")} isDisabled={isPending}>Ajukan</Button>
      )}
      {showApprove && (
        <>
          <Button variant="primary" onPress={() => setConfirmKind("approve")} isDisabled={isPending}>Setujui</Button>
          <Button variant="danger-soft" onPress={() => { setReason(""); setReasonKind("reject") }} isDisabled={isPending}>Tolak</Button>
        </>
      )}
      {showTransfer && (
        <Button variant="primary" onPress={() => setConfirmKind("transfer")} isDisabled={isPending}>Buat Transfer</Button>
      )}
      {showClose && (
        <Button variant="secondary" onPress={() => { setReason(""); setReasonKind("close") }} isDisabled={isPending}>Tutup Sisa Permintaan</Button>
      )}
      {showCancel && (
        <Button variant="danger-soft" onPress={() => { setReason(""); setReasonKind("cancel") }} isDisabled={isPending}>Batalkan</Button>
      )}

      <ConfirmDialog
        isOpen={confirmKind === "submit"}
        onOpenChange={(open) => { if (!open) setConfirmKind(null) }}
        title="Ajukan permintaan ini?"
        body="Permintaan diajukan ke gudang sumber untuk disetujui."
        confirmLabel="Ajukan"
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={() => run(() => submitMaterialRequest(id), "Permintaan berhasil diajukan", () => setConfirmKind(null))}
      />
      <ConfirmDialog
        isOpen={confirmKind === "approve"}
        onOpenChange={(open) => { if (!open) setConfirmKind(null) }}
        title="Setujui permintaan ini?"
        body="Permintaan disetujui; transfer dapat dibuat dari permintaan ini."
        confirmLabel="Setujui"
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={() => run(() => approveMaterialRequest(id), "Permintaan berhasil disetujui", () => setConfirmKind(null))}
      />
      <ConfirmDialog
        isOpen={confirmKind === "transfer"}
        onOpenChange={(open) => { if (!open) setConfirmKind(null) }}
        title="Buat transfer dari permintaan ini?"
        body="Transfer stok draft dibuat dari gudang sumber ke gudang tujuan sebesar sisa permintaan."
        confirmLabel="Buat Transfer"
        cancelLabel="Batal"
        variant="primary"
        isPending={isPending}
        onConfirm={() =>
          run(async () => {
            const result = await createTransferFromMaterialRequest(id)
            if (result.success && "slug" in result && result.slug) router.push(`/inventaris/transfer/${result.slug}`)
            return result
          }, "Transfer berhasil dibuat", () => setConfirmKind(null))
        }
      />

      <ConfirmDialog
        isOpen={reasonKind !== null}
        onOpenChange={(open) => { if (!open) setReasonKind(null) }}
        title={reasonKind ? REASON_CONFIG[reasonKind].title : ""}
        confirmLabel={reasonKind ? REASON_CONFIG[reasonKind].confirmLabel : "Konfirmasi"}
        cancelLabel="Batal"
        variant="danger"
        isPending={isPending}
        onConfirm={() => {
          if (!reasonKind) return
          const kind = reasonKind
          const clean = reason.trim()
          if (!clean) { showError(`${REASON_CONFIG[kind].label} wajib diisi`); return }
          const actions: Record<ReasonKind, () => Promise<{ success: boolean; error?: string }>> = {
            reject: () => rejectMaterialRequest(id, clean),
            cancel: () => cancelMaterialRequest(id, clean),
            close: () => closeMaterialRequest(id, clean),
          }
          const messages: Record<ReasonKind, string> = {
            reject: "Permintaan berhasil ditolak",
            cancel: "Permintaan berhasil dibatalkan",
            close: "Sisa permintaan berhasil ditutup",
          }
          run(actions[kind], messages[kind], () => setReasonKind(null))
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="material-request-reason">{reasonKind ? REASON_CONFIG[reasonKind].label : "Alasan"} <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Textarea
            id="material-request-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            aria-required="true"
            placeholder="Tulis alasan..."
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
