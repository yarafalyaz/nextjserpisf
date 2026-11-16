"use client"

// F-2026-10-25-035-F: permukaan persetujuan + jejak override gerbang kredit.
// Baris dari listCreditOverrides (server) verbatim — status turunan server,
// kode status kredit tersimpan (exposureStatus, mis. "over") dipetakan ke
// label builder lewat CREDIT_EXPOSURE_STATUS_LABEL (satu sumber label),
// UI nol hitung ulang. Setujui/Tolak hanya dirender untuk pemegang
// approve_credit_overrides (canApprove dari halaman); SoD ditegakkan server
// dan penolakannya tampil sebagai error jujur, bukan sukses semu.

import { useCallback, useMemo, useState, useTransition } from "react"
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
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper, type ErpColumnDef } from "@/lib/table"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
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

const columnHelper = createColumnHelper<CreditOverrideRow>()

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

  const runDecision = useCallback(
    (
      row: CreditOverrideRow,
      action: () => Promise<{ success: boolean; error?: string }>,
      successText: string,
      fallbackText: string,
    ) => {
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
    },
    [router],
  )

  const onApprove = useCallback(
    (row: CreditOverrideRow) => {
      runDecision(row, () => approveCreditOverride(row.id), "Override batas kredit disetujui", "Gagal menyetujui override")
    },
    [runDecision],
  )

  const onReject = useCallback(
    (row: CreditOverrideRow) => {
      const reason = (rejectReasons[row.id] ?? "").trim()
      if (!reason) {
        setRejectErrors((prev) => ({ ...prev, [row.id]: "Alasan penolakan wajib diisi" }))
        return
      }
      setRejectErrors((prev) => ({ ...prev, [row.id]: "" }))
      runDecision(row, () => rejectCreditOverride(row.id, reason), "Override batas kredit ditolak", "Gagal menolak override")
    },
    [rejectReasons, runDecision],
  )

  const columns = useMemo<ErpColumnDef<CreditOverrideRow, any>[]>(() => {
    const baseColumns: ErpColumnDef<CreditOverrideRow, any>[] = [
      columnHelper.accessor("customerName", {
        header: "Pelanggan",
        cell: (info) => {
          const row = info.row.original
          return row.customerName ?? `#${row.customerId}`
        },
      }),
      columnHelper.accessor("documentType", {
        header: "Dokumen",
        cell: (info) => DOCUMENT_TYPE_LABEL[info.getValue()] ?? info.getValue(),
      }),
      columnHelper.accessor("exposureStatus", {
        header: "Status Kredit",
        cell: (info) =>
          CREDIT_EXPOSURE_STATUS_LABEL[
            info.getValue() as keyof typeof CREDIT_EXPOSURE_STATUS_LABEL
          ] ?? info.getValue(),
      }),
      columnHelper.accessor("creditLimit", {
        header: "Batas Kredit",
        meta: { align: "right" },
        cell: (info) => <span className="tabular-nums">{formatCurrencyExact(info.getValue())}</span>,
      }),
      columnHelper.accessor("exposure", {
        header: "PaparanBersih",
        meta: { align: "right" },
        cell: (info) => <span className="tabular-nums">{formatCurrencyExact(info.getValue())}</span>,
      }),
      columnHelper.accessor("attemptedAmount", {
        header: "Nominal Percobaan",
        meta: { align: "right" },
        cell: (info) => <span className="tabular-nums">{formatCurrencyExact(info.getValue())}</span>,
      }),
      columnHelper.accessor("requestReason", {
        header: "Alasan Peminta",
      }),
      columnHelper.accessor("status", {
        header: "Status Override",
        cell: (info) => {
          const row = info.row.original
          return (
            <div>
              <StatusChip
                status={row.status}
                customLabel={CREDIT_OVERRIDE_STATUS_LABEL[row.status] ?? row.status}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {formatDate(row.createdAt)}
              </span>
            </div>
          )
        },
      }),
      columnHelper.display({
        id: "decision",
        header: "Keputusan",
        cell: (info) => {
          const row = info.row.original
          if (row.decisionReason) return <span>{row.decisionReason}</span>
          if (row.usedDocumentNo) return <span className="tabular-nums">Dokumen {row.usedDocumentNo}</span>
          return <span className="text-muted-foreground">-</span>
        },
      }),
    ]

    if (canApprove) {
      baseColumns.push(
        columnHelper.display({
          id: "actions",
          header: "Aksi",
          cell: (info) => {
            const row = info.row.original
            const isOwn = currentUserId != null && row.requestedBy === currentUserId
            const showActions = canApprove && row.status === "pending"
            if (!showActions) return <span className="text-muted-foreground">-</span>
            return (
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
            )
          },
        }),
      )
    }

    return baseColumns
  }, [canApprove, currentUserId, isPending, onApprove, onReject, rejectReasons, rejectErrors, actionErrors])

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-default bg-surface p-6 text-sm text-muted-foreground">
        Belum ada permintaan override batas kredit.
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-default bg-surface p-4 shadow-2xs overflow-hidden">
      <DataTable
        data={rows}
        columns={columns}
        ariaLabel="Antrean override batas kredit"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
    </div>
  )
}
