"use client"

// F-2026-10-25-035-F: panel pesan tertahan gerbang kredit + status permintaan
// override. Semua label/nominal dari payload server (hasil tertahan action
// penjualan / getMyCreditOverrideStatus) — UI nol hitung ulang, nol parafrase
// label status kredit. Panel ini TIDAK menahan tombol simpan (AC-CL2-F2):
// penahan terbukti di server; di sini pengguna mengisi alasan lalu menyimpan
// ulang form yang sama persis supaya server memersist permintaan pending.

import { useState, useTransition } from "react"
import { getMyCreditOverrideStatus } from "@/actions/credit-override.actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { formatCurrency } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"

export const CREDIT_OVERRIDE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  used: "Terpakai",
}

/** Hasil tertahan gerbang kredit dari action penjualan (kontrak Backend 035-B). */
export interface CreditGateBlockedState {
  error: string
  creditOverrideId: number | null
  creditLimit: number
  creditExposure: number
  creditStatus: string
  creditStatusLabel: string
}

/**
 * Plumbing gerbang kredit bersama form penjualan: status tertahan + alasan.
 * Field/skema/action tetap lokal per form; hook hanya mengurus guard alasan,
 * lampiran alasan ke FormData, dan penerapan hasil tertahan verbatim.
 */
export function useCreditGateBlocked() {
  const [creditBlocked, setCreditBlocked] = useState<CreditGateBlockedState | null>(null)
  const [creditReason, setCreditReason] = useState("")
  const [creditReasonError, setCreditReasonError] = useState<string | undefined>()

  /** true = submit boleh lanjut; false = alasan wajib belum diisi. */
  function guardCreditReason(): boolean {
    if (creditBlocked && creditBlocked.creditOverrideId == null && !creditReason.trim()) {
      setCreditReasonError("Alasan permintaan override wajib diisi")
      return false
    }
    setCreditReasonError(undefined)
    return true
  }

  function appendCreditReason(formData: FormData) {
    if (creditReason.trim()) formData.append("creditOverrideReason", creditReason.trim())
  }

  /** true = hasil adalah tertahan gerbang kredit (sudah diterapkan + toast). */
  function applyCreditResult(result: { success: boolean }): boolean {
    if (result.success) {
      setCreditBlocked(null)
      return false
    }
    if ("creditStatusLabel" in result && typeof result.creditStatusLabel === "string") {
      const b = result as unknown as CreditGateBlockedState & { error: string }
      setCreditBlocked({ ...b, creditOverrideId: b.creditOverrideId ?? null })
      return true
    }
    return false
  }

  const creditGatePanel = creditBlocked ? (
    <CreditOverridePanel
      blocked={creditBlocked}
      reason={creditReason}
      onReasonChange={setCreditReason}
      reasonError={creditReasonError}
    />
  ) : undefined

  return { creditBlocked, creditReason, creditReasonError, guardCreditReason, appendCreditReason, applyCreditResult, creditGatePanel }
}

interface CreditOverridePanelProps {
  blocked: CreditGateBlockedState
  reason: string
  onReasonChange: (reason: string) => void
  reasonError?: string
}

export function CreditOverridePanel({
  blocked,
  reason,
  onReasonChange,
  reasonError,
}: CreditOverridePanelProps) {
  const [statusById, setStatusById] = useState<{ id: number; status: string | null; error: string | null }>({ id: -1, status: null, error: null })
  const [isChecking, startCheck] = useTransition()

  const overrideId = blocked.creditOverrideId
  const overrideStatus = overrideId != null && statusById.id === overrideId ? statusById.status : null
  const statusError = overrideId != null && statusById.id === overrideId ? statusById.error : null

  function checkStatus() {
    if (overrideId == null) return
    startCheck(async () => {
      try {
        const result = await getMyCreditOverrideStatus(overrideId)
        if (result.success) {
          setStatusById({ id: overrideId, status: result.data.status, error: null })
        } else {
          setStatusById({ id: overrideId, status: null, error: result.error })
        }
      } catch (e) {
        setStatusById({ id: overrideId, status: null, error: e instanceof Error ? e.message : "Gagal memeriksa status override" })
      }
    })
  }

  return (
    <Alert variant="destructive" role="alert" aria-label="Dokumen tertahan gerbang kredit" className="mt-6">
      <AlertTitle>{blocked.error}</AlertTitle>
      <AlertDescription>
        <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Status Kredit</dt>
            <dd className="font-medium">{blocked.creditStatusLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Batas Kredit</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(blocked.creditLimit)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PaparanBersih</dt>
            <dd className="font-medium tabular-nums">{formatCurrency(blocked.creditExposure)}</dd>
          </div>
        </dl>

        {overrideId != null ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-sm">
              Permintaan override #{overrideId} tercatat. Status:{" "}
              <span className="font-medium">
                {overrideStatus ? (CREDIT_OVERRIDE_STATUS_LABEL[overrideStatus] ?? statusLabel(overrideStatus)) : "Belum diperiksa"}
              </span>
            </p>
            <div>
              <button
                type="button"
                onClick={checkStatus}
                disabled={isChecking}
                className="min-h-11 rounded-md border border-default px-3 text-sm font-medium disabled:opacity-50"
                aria-label="Periksa status permintaan override"
              >
                {isChecking ? "Memeriksa..." : "Periksa Status Override"}
              </button>
            </div>
            {overrideStatus === "approved" ? (
              <p className="text-sm">
                Override disetujui. Simpan ulang dokumen yang sama untuk memakai persetujuan ini.
              </p>
            ) : null}
            {statusError ? (
              <p role="alert" className="text-sm text-danger">{statusError}</p>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="creditOverrideReason">Alasan Permintaan Override</Label>
            <Textarea
              id="creditOverrideReason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Alasan meminta persetujuan override batas kredit..."
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? "creditOverrideReason-error" : undefined}
            />
            {reasonError ? (
              <span id="creditOverrideReason-error" role="alert" className="text-xs text-danger">{reasonError}</span>
            ) : null}
            <p className="text-sm">
              Isi alasan lalu simpan ulang dokumen yang sama untuk mencatat permintaan override.
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
