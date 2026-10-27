"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  createJobChangeOrder,
  updateJobChangeOrderLines,
  sendJobChangeOrder,
  recordJobChangeOrderApproval,
  cancelJobChangeOrder,
  applyJobChangeOrder,
} from "@/actions/job-change-order.actions"
import {
  JOB_CHANGE_ORDER_STATUS_LABELS,
  isChangeOrderTransitionAllowed,
  type JobChangeOrderStatus,
} from "@/lib/reports/job-change-order"
import type { ChangeOrderLineInput } from "@/lib/reports/job-change-order"
import { formatCurrency } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError, showSuccess } from "@/lib/utils/toast"
import { cn } from "@/lib/utils"

export interface ChangeOrderItemRow {
  id: number
  workOrderItemId: number | null
  itemId: number
  action: string
  description: string | null
  qtyBefore: number | null
  qtyAfter: number | null
  costBefore: number | null
  costAfter: number | null
  unitPriceBefore: number | null
  unitPriceAfter: number | null
}

export interface ChangeOrderRow {
  id: number
  documentNo: string
  status: string
  reason: string
  selisihNilai: number | null
  grandTotalSebelum: number | null
  grandTotalSesudah: number | null
  approvalReference: string | null
  appliedNote: string | null
  appliedInvoiceId: number | null
  appliedCreditId: number | null
  items: ChangeOrderItemRow[]
}

export interface WorkOrderLineOption {
  workOrderItemId: number
  itemId: number
  label: string
  qty: number
  cost: number
}

export interface InventoryItemOption {
  id: number
  label: string
  price: number
}

interface Props {
  workOrderId: number
  workOrderStatus: string
  hasQuotation: boolean
  /** Quotation.grandTotal berjalan (sumber nilai kontrak tunggal, BR-CO-01). */
  contractGrandTotal: number | null
  changeOrders: ChangeOrderRow[]
  workOrderItems: WorkOrderLineOption[]
  inventoryItems: InventoryItemOption[]
  itemNameById: Record<number, string>
  canCreate: boolean
  canEdit: boolean
  canApply: boolean
}

interface DraftLine {
  key: number
  action: "tambah" | "ubah" | "hapus"
  workOrderItemId: number | null
  itemId: number
  qtyAfter: string
  unitPriceAfter: string
}

let lineKey = 0
function nextKey() {
  lineKey += 1
  return lineKey
}

function statusTone(status: string): string {
  switch (status) {
    case "draft":
      return "bg-muted text-muted-foreground"
    case "menunggu_pelanggan":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
    case "disetujui":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    case "diterapkan":
      return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400"
    default:
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
  }
}

function toLines(drafts: DraftLine[]): ChangeOrderLineInput[] {
  return drafts.map((d) => ({
    action: d.action,
    workOrderItemId: d.action === "tambah" ? null : d.workOrderItemId,
    itemId: d.itemId,
    qtyAfter: d.action === "hapus" ? null : Number(d.qtyAfter) || 0,
    unitPriceAfter: d.action === "hapus" ? null : Number(d.unitPriceAfter) || 0,
  }))
}

/**
 * Panel Change Order WO (F-2026-10-22-066-S UI, t_b1b321cb).
 * Konsumen 7 aksi job-change-order.actions; nilai kontrak tunggal tetap
 * Quotation.grandTotal (BR-CO-01) — selisihNilai hanya info persetujuan.
 * Disable tombol mengikuti matriks transisi builder job-change-order.ts.
 */
export function JobChangeOrderPanel({
  workOrderId,
  workOrderStatus,
  hasQuotation,
  contractGrandTotal,
  changeOrders,
  workOrderItems,
  inventoryItems,
  itemNameById,
  canCreate,
  canEdit,
  canApply,
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [reason, setReason] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([])
  const [approvalFor, setApprovalFor] = useState<ChangeOrderRow | null>(null)
  const [approvalRef, setApprovalRef] = useState("")
  const [approvalUrl, setApprovalUrl] = useState("")
  const [rejectFor, setRejectFor] = useState<ChangeOrderRow | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [cancelFor, setCancelFor] = useState<ChangeOrderRow | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [sendFor, setSendFor] = useState<ChangeOrderRow | null>(null)
  const [applyFor, setApplyFor] = useState<ChangeOrderRow | null>(null)
  const [appliedNote, setAppliedNote] = useState<string | null>(null)

  const woEligible =
    hasQuotation && ["pending", "in_progress", "completed"].includes(workOrderStatus)
  const hasActive = changeOrders.some((co) =>
    ["draft", "menunggu_pelanggan", "disetujui"].includes(co.status),
  )

  function run(
    fn: () => Promise<{ success: boolean; error?: string }>,
    okMsg: string,
    after?: () => void,
  ) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          showSuccess(okMsg)
          after?.()
          router.refresh()
        } else {
          showError(res?.error || "Gagal memproses change order")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses change order")
      }
    })
  }

  function openCreate() {
    setEditingId(null)
    setReason("")
    setLines([])
    setFormOpen(true)
  }

  function openEdit(co: ChangeOrderRow) {
    setEditingId(co.id)
    setReason(co.reason)
    setLines(
      co.items.map((it) => ({
        key: nextKey(),
        action: (it.action as DraftLine["action"]) ?? "ubah",
        workOrderItemId: it.workOrderItemId,
        itemId: it.itemId,
        qtyAfter: it.qtyAfter != null ? String(it.qtyAfter) : "",
        unitPriceAfter: it.unitPriceAfter != null ? String(it.unitPriceAfter) : "",
      })),
    )
    setFormOpen(true)
  }

  function addLine(action: DraftLine["action"]) {
    if (action === "tambah") {
      const first = inventoryItems[0]
      setLines((p) => [
        ...p,
        { key: nextKey(), action, workOrderItemId: null, itemId: first?.id ?? 0, qtyAfter: "1", unitPriceAfter: first ? String(first.price) : "0" },
      ])
    } else {
      const first = workOrderItems[0]
      setLines((p) => [
        ...p,
        {
          key: nextKey(),
          action,
          workOrderItemId: first?.workOrderItemId ?? null,
          itemId: first?.itemId ?? 0,
          qtyAfter: first ? String(first.qty) : "1",
          unitPriceAfter: first ? String(first.cost) : "0",
        },
      ])
    }
  }

  function patchLine(key: number, patch: Partial<DraftLine>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function submitForm() {
    if (!reason.trim()) {
      showError("Alasan perubahan wajib diisi")
      return
    }
    if (lines.length === 0) {
      showError("Change order wajib punya minimal satu baris perubahan")
      return
    }
    const payload = toLines(lines)
    if (editingId != null) {
      run(
        () => updateJobChangeOrderLines({ changeOrderId: editingId, reason: reason.trim(), lines: payload }),
        "Baris change order diperbarui",
        () => setFormOpen(false),
      )
    } else {
      run(
        () => createJobChangeOrder({ workOrderId, reason: reason.trim(), lines: payload }),
        "Change order dibuat (draf)",
        () => setFormOpen(false),
      )
    }
  }

  return (
    <section aria-label="Change Order Perintah Kerja" className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Change Order</h2>
        <div className="flex flex-wrap items-center gap-3">
          {contractGrandTotal != null ? (
            <p className="text-xs text-muted-foreground">
              Nilai kontrak (penawaran): <span className="font-medium text-foreground">{formatCurrency(contractGrandTotal)}</span>
            </p>
          ) : null}
          {canCreate && woEligible && !hasActive ? (
            <Button variant="primary" size="sm" isDisabled={isPending} onPress={openCreate}>
              + Change Order
            </Button>
          ) : null}
        </div>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        {!hasQuotation ? (
          <p role="note" className="text-sm text-muted-foreground">
            Perintah kerja tanpa penawaran tertaut tidak dapat dibuatkan change order — tidak ada sumber nilai kontrak tunggal.
          </p>
        ) : !["pending", "in_progress", "completed"].includes(workOrderStatus) ? (
          <p role="note" className="text-sm text-muted-foreground">
            Change order hanya boleh dibuka pada Perintah Kerja berstatus pending, in_progress, atau completed.
          </p>
        ) : null}

        {appliedNote ? (
          <p role="status" className="rounded-lg border border-default bg-muted/30 px-3 py-2 text-sm text-foreground">
            {appliedNote}
          </p>
        ) : null}

        {changeOrders.length === 0 ? (
          <EmptyState title="Belum ada change order untuk perintah kerja ini" className="py-10" />
        ) : (
          changeOrders.map((co) => {
            const label =
              JOB_CHANGE_ORDER_STATUS_LABELS[co.status as JobChangeOrderStatus] ?? co.status
            const canSend = canEdit && isChangeOrderTransitionAllowed(co.status, "menunggu_pelanggan")
            const canRecord = canEdit && isChangeOrderTransitionAllowed(co.status, "disetujui")
            const canCancel =
              canEdit &&
              (isChangeOrderTransitionAllowed(co.status, "dibatalkan"))
            const canApplyCo = canApply && isChangeOrderTransitionAllowed(co.status, "diterapkan")
            const canEditLines = canEdit && co.status === "draft"
            return (
              <article key={co.id} aria-label={`Change order ${co.documentNo}`} className="rounded-lg border border-default overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2">
                  <span className="font-mono text-sm font-medium text-foreground">{co.documentNo}</span>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", statusTone(co.status))}>
                    {label}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-3 py-3">
                  <p className="text-sm text-foreground">{co.reason}</p>
                  {co.selisihNilai != null ? (
                    <p className="text-xs text-muted-foreground">
                      Selisih nilai (info persetujuan): <span className="font-medium text-foreground">{formatCurrency(co.selisihNilai)}</span>
                      {co.grandTotalSebelum != null && co.grandTotalSesudah != null ? (
                        <> · Nilai kontrak {formatCurrency(co.grandTotalSebelum)} → {formatCurrency(co.grandTotalSesudah)}</>
                      ) : null}
                    </p>
                  ) : null}
                  {co.approvalReference ? (
                    <p className="text-xs text-muted-foreground">Bukti persetujuan: {co.approvalReference}</p>
                  ) : null}
                  {co.appliedNote ? (
                    <p role="note" className="text-xs text-muted-foreground">{co.appliedNote}</p>
                  ) : null}
                  {co.items.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="py-1 pr-2 font-medium">Aksi</th>
                            <th className="py-1 pr-2 font-medium">Barang</th>
                            <th className="py-1 pr-2 font-medium text-right">Qty sebelum</th>
                            <th className="py-1 pr-2 font-medium text-right">Qty sesudah</th>
                            <th className="py-1 font-medium text-right">Harga sesudah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {co.items.map((it) => (
                            <tr key={it.id} className="border-t border-default">
                              <td className="py-1 pr-2 capitalize">{it.action}</td>
                              <td className="py-1 pr-2">{it.description || itemNameById[it.itemId] || `Barang #${it.itemId}`}</td>
                              <td className="py-1 pr-2 text-right">{it.qtyBefore ?? "—"}</td>
                              <td className="py-1 pr-2 text-right">{it.qtyAfter ?? "—"}</td>
                              <td className="py-1 text-right">{it.unitPriceAfter != null ? formatCurrency(it.unitPriceAfter) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {canEditLines ? (
                      <Button variant="secondary" size="sm" isDisabled={isPending} onPress={() => openEdit(co)}>
                        Ubah Baris
                      </Button>
                    ) : null}
                    {canSend ? (
                      <Button variant="primary" size="sm" isDisabled={isPending} onPress={() => setSendFor(co)}>
                        Kirim ke Pelanggan
                      </Button>
                    ) : null}
                    {canRecord ? (
                      <>
                        <Button variant="primary" size="sm" isDisabled={isPending} onPress={() => { setApprovalRef(""); setApprovalUrl(""); setApprovalFor(co) }}>
                          Catat Persetujuan
                        </Button>
                        <Button variant="secondary" size="sm" isDisabled={isPending} onPress={() => { setRejectReason(""); setRejectFor(co) }}>
                          Catat Penolakan
                        </Button>
                      </>
                    ) : null}
                    {canApplyCo ? (
                      <Button variant="primary" size="sm" isDisabled={isPending} onPress={() => setApplyFor(co)}>
                        Terapkan Change Order
                      </Button>
                    ) : null}
                    {canCancel ? (
                      <Button variant="danger-soft" size="sm" isDisabled={isPending} onPress={() => { setCancelReason(""); setCancelFor(co) }}>
                        Batalkan
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            )
          })
        )}

        {formOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={editingId ? "Ubah baris change order" : "Buat change order"}>
            <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">{editingId ? "Ubah Baris Change Order" : "Buat Change Order"}</h3>
              <div className="flex flex-col gap-1">
                <label htmlFor="co-reason" className="text-sm font-medium text-foreground">
                  Alasan perubahan <span aria-hidden="true" className="text-destructive">*</span>
                </label>
                <textarea
                  id="co-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  aria-required="true"
                  rows={2}
                  className="rounded-lg border border-default bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-2">
                {lines.map((line) => (
                  <div key={line.key} className="flex flex-wrap items-end gap-2 rounded-lg border border-default p-2">
                    <span className="text-xs font-medium capitalize text-muted-foreground">{line.action}</span>
                    {line.action === "tambah" ? (
                      <label className="flex flex-col gap-1 text-xs">
                        Barang
                        <select
                          aria-label="Barang baris tambah"
                          value={line.itemId}
                          onChange={(e) => {
                            const item = inventoryItems.find((i) => i.id === Number(e.target.value))
                            patchLine(line.key, { itemId: Number(e.target.value), unitPriceAfter: item ? String(item.price) : line.unitPriceAfter })
                          }}
                          className="min-h-11 rounded-lg border border-default bg-background px-2 text-sm"
                        >
                          {inventoryItems.map((i) => (
                            <option key={i.id} value={i.id}>{i.label}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1 text-xs">
                        Baris perintah kerja
                        <select
                          aria-label="Baris perintah kerja"
                          value={line.workOrderItemId ?? ""}
                          onChange={(e) => {
                            const wo = workOrderItems.find((w) => w.workOrderItemId === Number(e.target.value))
                            patchLine(line.key, {
                              workOrderItemId: Number(e.target.value),
                              itemId: wo?.itemId ?? line.itemId,
                              qtyAfter: wo ? String(wo.qty) : line.qtyAfter,
                              unitPriceAfter: wo ? String(wo.cost) : line.unitPriceAfter,
                            })
                          }}
                          className="min-h-11 rounded-lg border border-default bg-background px-2 text-sm"
                        >
                          {workOrderItems.map((w) => (
                            <option key={w.workOrderItemId} value={w.workOrderItemId}>{w.label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    {line.action !== "hapus" ? (
                      <>
                        <label className="flex flex-col gap-1 text-xs">
                          Qty sesudah
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label="Qty sesudah"
                            value={line.qtyAfter}
                            onChange={(e) => patchLine(line.key, { qtyAfter: e.target.value })}
                            className="min-h-11 w-24 rounded-lg border border-default bg-background px-2 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-xs">
                          Harga sesudah (Rp)
                          <input
                            type="number"
                            min={0}
                            step="any"
                            aria-label="Harga sesudah"
                            value={line.unitPriceAfter}
                            onChange={(e) => patchLine(line.key, { unitPriceAfter: e.target.value })}
                            className="min-h-11 w-32 rounded-lg border border-default bg-background px-2 text-sm"
                          />
                        </label>
                      </>
                    ) : null}
                    <Button variant="danger-soft" size="sm" isDisabled={isPending} onPress={() => setLines((p) => p.filter((l) => l.key !== line.key))}>
                      Hapus Baris
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" isDisabled={isPending || inventoryItems.length === 0} onPress={() => addLine("tambah")}>
                    + Baris Tambah
                  </Button>
                  <Button variant="secondary" size="sm" isDisabled={isPending || workOrderItems.length === 0} onPress={() => addLine("ubah")}>
                    + Baris Ubah
                  </Button>
                  <Button variant="secondary" size="sm" isDisabled={isPending || workOrderItems.length === 0} onPress={() => addLine("hapus")}>
                    + Baris Hapus
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" isDisabled={isPending} onPress={() => setFormOpen(false)}>
                  Batal
                </Button>
                <Button variant="primary" isDisabled={isPending} onPress={submitForm}>
                  {editingId ? "Simpan Baris" : "Buat Change Order"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {approvalFor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Catat persetujuan pelanggan">
            <div className="w-full max-w-lg rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Catat Persetujuan Pelanggan</h3>
              <div className="flex flex-col gap-1">
                <label htmlFor="co-approval-ref" className="text-sm font-medium text-foreground">
                  Referensi bukti persetujuan <span aria-hidden="true" className="text-destructive">*</span>
                </label>
                <input
                  id="co-approval-ref"
                  value={approvalRef}
                  onChange={(e) => setApprovalRef(e.target.value)}
                  required
                  aria-required="true"
                  placeholder="Nomor chat WA / tanggal / nomor surat"
                  className="min-h-11 rounded-lg border border-default bg-background px-3 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="co-approval-url" className="text-sm font-medium text-foreground">URL lampiran bukti (opsional)</label>
                <input
                  id="co-approval-url"
                  value={approvalUrl}
                  onChange={(e) => setApprovalUrl(e.target.value)}
                  className="min-h-11 rounded-lg border border-default bg-background px-3 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" isDisabled={isPending} onPress={() => setApprovalFor(null)}>Batal</Button>
                <Button
                  variant="primary"
                  isDisabled={isPending || !approvalRef.trim()}
                  onPress={() =>
                    run(
                      () => recordJobChangeOrderApproval({ changeOrderId: approvalFor.id, approved: true, approvalReference: approvalRef.trim(), approvalAttachmentUrl: approvalUrl.trim() || undefined }),
                      "Persetujuan pelanggan tercatat",
                      () => setApprovalFor(null),
                    )
                  }
                >
                  Simpan Persetujuan
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {rejectFor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Catat penolakan pelanggan">
            <div className="w-full max-w-lg rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Catat Penolakan Pelanggan</h3>
              <div className="flex flex-col gap-1">
                <label htmlFor="co-reject-reason" className="text-sm font-medium text-foreground">
                  Alasan penolakan <span aria-hidden="true" className="text-destructive">*</span>
                </label>
                <textarea
                  id="co-reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                  aria-required="true"
                  rows={2}
                  className="rounded-lg border border-default bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" isDisabled={isPending} onPress={() => setRejectFor(null)}>Batal</Button>
                <Button
                  variant="primary"
                  isDisabled={isPending || !rejectReason.trim()}
                  onPress={() =>
                    run(
                      () => recordJobChangeOrderApproval({ changeOrderId: rejectFor.id, approved: false, rejectionReason: rejectReason.trim() }),
                      "Penolakan pelanggan tercatat",
                      () => setRejectFor(null),
                    )
                  }
                >
                  Simpan Penolakan
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {cancelFor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Batalkan change order">
            <div className="w-full max-w-lg rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
              <h3 className="text-base font-semibold text-foreground">Batalkan Change Order {cancelFor.documentNo}</h3>
              <div className="flex flex-col gap-1">
                <label htmlFor="co-cancel-reason" className="text-sm font-medium text-foreground">
                  Alasan pembatalan <span aria-hidden="true" className="text-destructive">*</span>
                </label>
                <textarea
                  id="co-cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required
                  aria-required="true"
                  rows={2}
                  className="rounded-lg border border-default bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" isDisabled={isPending} onPress={() => setCancelFor(null)}>Kembali</Button>
                <Button
                  variant="danger"
                  isDisabled={isPending || !cancelReason.trim()}
                  onPress={() =>
                    run(
                      () => cancelJobChangeOrder({ changeOrderId: cancelFor.id, reason: cancelReason.trim() }),
                      "Change order dibatalkan",
                      () => setCancelFor(null),
                    )
                  }
                >
                  Batalkan Change Order
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={!!sendFor}
        onOpenChange={(open) => { if (!open) setSendFor(null) }}
        title={`Kirim ${sendFor?.documentNo ?? "change order"} ke pelanggan?`}
        body="Status berubah menjadi Menunggu Pelanggan. Snapshot selisih nilai dan nilai kontrak sebelum/sesudah disimpan server."
        confirmLabel="Kirim"
        variant="primary"
        isPending={isPending}
        onConfirm={() => {
          if (!sendFor) return
          run(() => sendJobChangeOrder(sendFor.id), "Change order dikirim ke pelanggan", () => setSendFor(null))
        }}
      />
      <ConfirmDialog
        isOpen={!!applyFor}
        onOpenChange={(open) => { if (!open) setApplyFor(null) }}
        title={`Terapkan ${applyFor?.documentNo ?? "change order"}?`}
        body="Nilai kontrak penawaran direvisi server; faktur selisih atau kredit revisi-turun lahir lewat jalur existing bila ada selisih. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Terapkan"
        variant="danger"
        isPending={isPending}
        onConfirm={() => {
          if (!applyFor) return
          startTransition(async () => {
            try {
              const res = await applyJobChangeOrder(applyFor.id)
              if (res?.success) {
                const note = ("note" in res && typeof res.note === "string" && res.note) || "Change order diterapkan."
                setAppliedNote(note)
                showSuccess(note)
                setApplyFor(null)
                router.refresh()
              } else {
                showError(("error" in res && res.error) || "Gagal menerapkan change order")
              }
            } catch (e) {
              showError(e instanceof Error ? e.message : "Gagal menerapkan change order")
            }
          })
        }}
      />
    </section>
  )
}
