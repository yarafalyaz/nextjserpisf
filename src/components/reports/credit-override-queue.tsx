"use client"

// F-2026-10-25-035-F: permukaan persetujuan + jejak override gerbang kredit.
// Baris dari listCreditOverrides (server) verbatim — status turunan server,
// kode status kredit tersimpan (exposureStatus, mis. "over") dipetakan ke
// label builder lewat CREDIT_EXPOSURE_STATUS_LABEL (satu sumber label),
// UI nol hitung ulang. Setujui/Tolak hanya dirender untuk pemegang
// approve_credit_overrides (canApprove dari halaman); SoD ditegakkan server
// dan penolakannya tampil sebagai error jujur, bukan sukses semu.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  approveCreditOverride,
  rejectCreditOverride,
} from "@/actions/credit-override.actions"
import { CREDIT_OVERRIDE_STATUS_LABEL } from "@/components/forms/credit-override-panel"
import { CREDIT_EXPOSURE_STATUS_LABEL } from "@/lib/reports/customer-receivables"
import { StatusChip } from "@/components/ui/status-chip"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"

export interface CreditOverrideRow {
  id: number
  customerId: number
  customerName: string | null
  documentType: string
  attemptedAmount: number
  creditLimit: number
  exposure: number
  exposureStatus: string
  utilization: number | null
  quotationId: number | null
  salesOrderId: number | null
  requestedBy: number
  requestReason: string
  status: string
  storedStatus: string
  decidedBy: number | null
  decidedAt: Date | string | null
  decisionReason: string | null
  usedDocumentId: number | null
  usedDocumentNo: string | null
  expiresAt: Date | string | null
  createdAt: Date | string
  updatedAt: Date | string
}

const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  sales_order: "Pesanan Penjualan",
  sales_invoice: "Faktur Penjualan",
}

export function CreditOverrideQueue({
  rows,
  canApprove,
  currentUserId,
}: Readonly<{
  rows: CreditOverrideRow[]
  canApprove: boolean
  currentUserId: number | null
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rejectReasons, setRejectReasons] = useState<Record<number, string>>({})
  const [rejectErrors, setRejectErrors] = useState<Record<number, string>>({})
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  function runDecision(row: CreditOverrideRow, action: () => Promise<{ success: boolean; error?: string }>, successText: string, fallbackText: string) {
    startTransition(async () => {
      try {
        const result = await action()
        if (result.success) {
          setActionErrors((prev) => ({ ...prev, [row.id]: "" }))
          showSuccess(successText)
          router.refresh()
        } else {
          setActionErrors((prev) => ({ ...prev, [row.id]: result.error ?? fallbackText }))
          showError(result.error ?? fallbackText)
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : fallbackText
        setActionErrors((prev) => ({ ...prev, [row.id]: message }))
        showError(message)
      }
    })
  }

  function onApprove(row: CreditOverrideRow) {
    runDecision(row, () => approveCreditOverride(row.id), "Override batas kredit disetujui", "Gagal menyetujui override")
  }

  function onReject(row: CreditOverrideRow) {
    const reason = (rejectReasons[row.id] ?? "").trim()
    if (!reason) {
      setRejectErrors((prev) => ({ ...prev, [row.id]: "Alasan penolakan wajib diisi" }))
      return
    }
    setRejectErrors((prev) => ({ ...prev, [row.id]: "" }))
    runDecision(row, () => rejectCreditOverride(row.id, reason), "Override batas kredit ditolak", "Gagal menolak override")
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-default bg-surface p-6 text-sm text-muted-foreground">
        Belum ada permintaan override batas kredit.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-default bg-surface shadow-sm">
      <DetailTable>
        <DetailTableHead>
          <DetailTableRow>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>Dokumen</DetailTableTh>
            <DetailTableTh>Status Kredit</DetailTableTh>
            <DetailTableTh>Batas Kredit</DetailTableTh>
            <DetailTableTh>PaparanBersih</DetailTableTh>
            <DetailTableTh>Nominal Percobaan</DetailTableTh>
            <DetailTableTh>Alasan Peminta</DetailTableTh>
            <DetailTableTh>Status Override</DetailTableTh>
            <DetailTableTh>Keputusan</DetailTableTh>
            {canApprove ? <DetailTableTh>Aksi</DetailTableTh> : null}
          </DetailTableRow>
        </DetailTableHead>
        <DetailTableBody>
          {rows.map((row) => {
            const isOwn = currentUserId != null && row.requestedBy === currentUserId
            const showActions = canApprove && row.status === "pending"
            return (
              <DetailTableRow key={row.id}>
                <DetailTableTd>{row.customerName ?? `#${row.customerId}`}</DetailTableTd>
                <DetailTableTd>{DOCUMENT_TYPE_LABEL[row.documentType] ?? row.documentType}</DetailTableTd>
                <DetailTableTd>{CREDIT_EXPOSURE_STATUS_LABEL[row.exposureStatus as keyof typeof CREDIT_EXPOSURE_STATUS_LABEL] ?? row.exposureStatus}</DetailTableTd>
                <DetailTableTd className="tabular-nums">{formatCurrency(row.creditLimit)}</DetailTableTd>
                <DetailTableTd className="tabular-nums">{formatCurrency(row.exposure)}</DetailTableTd>
                <DetailTableTd className="tabular-nums">{formatCurrency(row.attemptedAmount)}</DetailTableTd>
                <DetailTableTd>{row.requestReason}</DetailTableTd>
                <DetailTableTd>
                  <StatusChip status={row.status} customLabel={CREDIT_OVERRIDE_STATUS_LABEL[row.status] ?? row.status} />
                  <span className="mt-1 block text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
                </DetailTableTd>
                <DetailTableTd>
                  {row.decisionReason ? (
                    <span>{row.decisionReason}</span>
                  ) : row.usedDocumentNo ? (
                    <span>Dokumen {row.usedDocumentNo}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </DetailTableTd>
                {canApprove ? (
                  <DetailTableTd>
                    {showActions ? (
                      <div className="flex min-w-56 flex-col gap-2">
                        {isOwn ? (
                          <p className="text-xs text-muted-foreground">
                            Permintaan Anda sendiri — pemisahan tugas ditegakkan server.
                          </p>
                        ) : null}
                        <div>
                          <button
                            type="button"
                            onClick={() => onApprove(row)}
                            disabled={isPending}
                            className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                            aria-label={`Setujui override batas kredit ${row.id}`}
                          >
                            Setujui
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor={`alasan-tolak-${row.id}`}>Alasan Penolakan</Label>
                          <Textarea
                            id={`alasan-tolak-${row.id}`}
                            value={rejectReasons[row.id] ?? ""}
                            onChange={(e) =>
                              setRejectReasons((prev) => ({ ...prev, [row.id]: e.target.value }))
                            }
                            rows={2}
                            maxLength={1000}
                            placeholder="Alasan menolak override ini..."
                            aria-invalid={rejectErrors[row.id] ? true : undefined}
                            aria-describedby={rejectErrors[row.id] ? `alasan-tolak-${row.id}-error` : undefined}
                          />
                          {rejectErrors[row.id] ? (
                            <span id={`alasan-tolak-${row.id}-error`} role="alert" className="text-xs text-danger">
                              {rejectErrors[row.id]}
                            </span>
                          ) : null}
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => onReject(row)}
                            disabled={isPending}
                            className="min-h-11 rounded-md border border-danger px-3 text-sm font-medium text-danger disabled:opacity-50"
                            aria-label={`Tolak override batas kredit ${row.id}`}
                          >
                            Tolak
                          </button>
                        </div>
                        {actionErrors[row.id] ? (
                          <p role="alert" className="text-xs text-danger">{actionErrors[row.id]}</p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </DetailTableTd>
                ) : null}
              </DetailTableRow>
            )
          })}
        </DetailTableBody>
      </DetailTable>
    </div>
  )
}
