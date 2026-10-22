"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  requestBomRevisionChange,
  decideBomRevisionChange,
} from "@/actions/bom-revision-change.actions"
import { previewBomRevisionChangeDelta } from "@/actions/bom-revision-change-preview.actions"
import type { BomRevisionDeltaLine } from "@/lib/reports/bom-revision-impact"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormSelect } from "@/components/ui/form-select"
import { statusLabel } from "@/lib/utils/status-labels"
import { formatDate } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import { cn } from "@/lib/utils"

export interface BomRevisionChangeRequestRow {
  id: number
  fromRevisionId: number
  toRevisionId: number
  reason: string
  status: string
  requestedBy: number | null
  decidedBy: number | null
  decidedAt: Date | string | null
  decisionReason: string | null
  createdAt: Date | string
}

export interface BomRevisionOption {
  id: number
  revisionNo: number
}

/** Pin pasangan WO↔PO (Q-BOM68-4/BR-BOM68-07): pin dokumen tertaut, ditampilkan sebelum simpan. */
export interface BomRevisionPairedPin {
  label: string
  documentNo: string
  revisionNo: number
}

export interface BomRevisionChangeDeltaPreview {
  lines: (BomRevisionDeltaLine & { itemName: string })[]
  hasGenuinelyNew: boolean
}

/** Gerbang Kirim Pengajuan: nonaktif selama pengiriman/muat pratinjau, atau pratinjau/tujuan/alasan belum ada. */
export function isBomRevisionSubmitDisabled(input: {
  isPending: boolean
  previewLoading: boolean
  preview: unknown
  toRevisionId: string
  reason: string
}): boolean {
  return (
    input.isPending ||
    input.previewLoading ||
    !input.preview ||
    !input.toRevisionId ||
    !input.reason.trim()
  )
}

interface Props {
  owner: { workOrderId: number } | { productionOrderId: number }
  /** Status dokumen pemilik; panel senyap total bila tidak ada revisi ter-pin. */
  documentStatus: string
  currentRevision: { id: number; revisionNo: number } | null
  revisionOptions: BomRevisionOption[]
  requests: BomRevisionChangeRequestRow[]
  revisionNoById: Record<number, number>
  userNameById: Record<number, string>
  itemNameById: Record<number, string>
  canManage: boolean
  /** userId sesi saat ini; penyetuju == pengaju disembunyikan (SoD server tetap menegakkan). */
  currentUserId: number | null
  /** Pin pasangan tertaut (Q-BOM68-4); kosong = tidak ada pasangan ter-pin untuk ditampilkan. */
  pairedPins?: BomRevisionPairedPin[]
}

const CLOSED = ["completed", "cancelled", "closed"]

function statusTone(status: string): string {
  switch (status) {
    case "menunggu":
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
    case "disetujui":
    case "diterapkan_langsung":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    case "ditolak":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function coverageLabel(coverage: BomRevisionDeltaLine["coverage"]): string {
  switch (coverage) {
    case "tercakup":
      return "Tercakup"
    case "kurang":
      return "Kurang"
    default:
      return "Perlu tinjau"
  }
}

function coverageTone(coverage: BomRevisionDeltaLine["coverage"]): string {
  switch (coverage) {
    case "tercakup":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    case "kurang":
      return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
  }
}

/**
 * Panel "Ganti revisi BOM" order berjalan (F-2026-10-22-068-S, t_b60d664d).
 * Konsumen aksi BOT 3 PR #589: request/decide/list (muat di page) +
 * loadBomRevisionChangeDelta lewat aksi pratinjau. UI menampilkan hasil
 * builder apa adanya — status cakupan tampil saja, tanpa aksi reservasi
 * (BR-BOM68-10); UI tidak menghitung kebutuhan/stok.
 */
export function BomRevisionChangePanel({
  owner,
  documentStatus,
  currentRevision,
  revisionOptions,
  requests,
  revisionNoById,
  userNameById,
  itemNameById,
  canManage,
  currentUserId,
  pairedPins = [],
}: Readonly<Props>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [toRevisionId, setToRevisionId] = useState("")
  const [reason, setReason] = useState("")
  const [preview, setPreview] = useState<BomRevisionChangeDeltaPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [approveFor, setApproveFor] = useState<BomRevisionChangeRequestRow | null>(null)
  const [rejectFor, setRejectFor] = useState<BomRevisionChangeRequestRow | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  if (!currentRevision) return null

  const isClosed = CLOSED.includes(documentStatus)
  const hasPending = requests.some((r) => r.status === "menunggu")
  const canRequest = canManage && !isClosed && !hasPending && revisionOptions.length > 0

  function revLabel(id: number): string {
    const no = revisionNoById[id]
    return no != null ? `Rev. ${no}` : `Revisi #${id}`
  }

  function userLabel(id: number | null): string {
    if (id == null) return "-"
    return userNameById[id] ?? `Pengguna #${id}`
  }

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
          showError(res?.error || "Gagal memproses ganti revisi BOM")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses ganti revisi BOM")
      }
    })
  }

  function loadPreview(nextId: string) {
    setToRevisionId(nextId)
    setPreview(null)
    if (!nextId) return
    setPreviewLoading(true)
    startTransition(async () => {
      try {
        const res = await previewBomRevisionChangeDelta({
          ...owner,
          toRevisionId: Number(nextId),
        })
        if (res.success && res.delta) {
          setPreview({
            hasGenuinelyNew: res.delta.hasGenuinelyNew,
            lines: res.delta.lines.map((l) => ({
              ...l,
              itemName: itemNameById[l.itemId] ?? `Barang #${l.itemId}`,
            })),
          })
        } else if (!res.success) {
          showError(res.error)
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memuat pratinjau selisih revisi BOM")
      } finally {
        setPreviewLoading(false)
      }
    })
  }

  function submitRequest() {
    if (!toRevisionId) {
      showError("Revisi BOM tujuan wajib dipilih.")
      return
    }
    if (!reason.trim()) {
      showError("Alasan ganti revisi BOM wajib diisi.")
      return
    }
    run(
      () =>
        requestBomRevisionChange({
          ...owner,
          toRevisionId: Number(toRevisionId),
          reason: reason.trim(),
        }),
      "Ganti revisi BOM diajukan",
      () => {
        setFormOpen(false)
        setToRevisionId("")
        setReason("")
        setPreview(null)
      },
    )
  }

  return (
    <section
      aria-label="Ganti revisi BOM"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Ganti Revisi BOM</h2>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Revisi terpasang:{" "}
            <span className="font-medium text-foreground">Rev. {currentRevision.revisionNo}</span>
          </p>
          {pairedPins.map((pin) => (
            <p key={`${pin.label}-${pin.documentNo}`} role="note" className="text-xs text-muted-foreground">
              Pin {pin.label} {pin.documentNo}:{" "}
              <span className="font-medium text-foreground">Rev. {pin.revisionNo}</span>{" "}
              — ganti revisi dokumen ini tidak mengubah pin {pin.label}.
            </p>
          ))}
          {canRequest ? (
            <Button
              variant="primary"
              size="sm"
              isDisabled={isPending}
              onPress={() => {
                setToRevisionId("")
                setReason("")
                setPreview(null)
                setFormOpen(true)
              }}
            >
              + Ganti Revisi BOM
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-4 px-5 flex flex-col gap-4">
        {isClosed ? (
          <p role="note" className="text-sm text-muted-foreground">
            Dokumen sudah ditutup; ganti revisi BOM tidak dapat diajukan.
          </p>
        ) : hasPending ? (
          <p role="note" className="text-sm text-muted-foreground">
            Masih ada pengajuan ganti revisi BOM yang menunggu keputusan untuk dokumen ini.
          </p>
        ) : canManage && revisionOptions.length === 0 ? (
          <p role="note" className="text-sm text-muted-foreground">
            Belum ada revisi BOM released lain untuk produk ini.
          </p>
        ) : null}

        {requests.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            Belum ada pengajuan ganti revisi BOM untuk dokumen ini
          </p>
        ) : (
          requests.map((req) => {
            const isSelf = currentUserId != null && req.requestedBy === currentUserId
            const canDecide = canManage && req.status === "menunggu" && !isSelf
            return (
              <article
                key={req.id}
                aria-label={`Pengajuan ganti revisi BOM #${req.id}`}
                className="rounded-lg border border-default overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">
                    {revLabel(req.fromRevisionId)} → {revLabel(req.toRevisionId)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                      statusTone(req.status),
                    )}
                  >
                    {statusLabel(req.status)}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-3 py-3">
                  <p className="text-sm text-foreground">{req.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    Diajukan oleh {userLabel(req.requestedBy)} · {formatDate(req.createdAt)}
                  </p>
                  {req.decidedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Diputuskan oleh {userLabel(req.decidedBy)} · {formatDate(req.decidedAt)}
                      {req.decisionReason ? <> · Alasan keputusan: {req.decisionReason}</> : null}
                    </p>
                  ) : null}
                  {req.status === "menunggu" && isSelf && canManage ? (
                    <p role="note" className="text-xs text-muted-foreground">
                      Pengajuan Anda sendiri tidak dapat Anda putuskan sendiri (pemisahan tugas).
                    </p>
                  ) : null}
                  {canDecide ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        isDisabled={isPending}
                        onPress={() => setApproveFor(req)}
                      >
                        Setujui
                      </Button>
                      <Button
                        variant="danger-soft"
                        size="sm"
                        isDisabled={isPending}
                        onPress={() => {
                          setRejectReason("")
                          setRejectFor(req)
                        }}
                      >
                        Tolak
                      </Button>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ganti revisi BOM"
        >
          <div className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Ganti Revisi BOM</h3>
            <p className="text-sm text-muted-foreground">
              Dari Rev. {currentRevision.revisionNo} (terpasang saat ini). Bila material sudah
              keluar, pengajuan menunggu persetujuan pengguna lain; bila belum, revisi langsung
              diterapkan.
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="bom-change-to-revision" className="text-sm font-medium text-foreground">
                Revisi tujuan <span aria-hidden="true" className="text-destructive">*</span>
              </label>
              <FormSelect
                id="bom-change-to-revision"
                aria-label="Revisi tujuan"
                required
                placeholder="-- Pilih revisi released --"
                value={toRevisionId}
                onValueChange={loadPreview}
                options={revisionOptions.map((r) => ({
                  value: String(r.id),
                  label: `Rev. ${r.revisionNo}`,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="bom-change-reason" className="text-sm font-medium text-foreground">
                Alasan ganti revisi <span aria-hidden="true" className="text-destructive">*</span>
              </label>
              <textarea
                id="bom-change-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                aria-required="true"
                rows={2}
                className="min-h-11 rounded-lg border border-default bg-background px-3 py-2 text-sm"
              />
            </div>

            {previewLoading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Memuat pratinjau selisih revisi…
              </p>
            ) : preview ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-foreground">Pratinjau Selisih Revisi</h4>
                {preview.hasGenuinelyNew ? (
                  <p role="note" className="text-sm text-amber-700 dark:text-amber-400">
                    Revisi tujuan memuat kebutuhan bahan baru yang belum pernah keluar untuk dokumen
                    ini.
                  </p>
                ) : null}
                {preview.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Revisi tujuan tidak memuat baris bahan.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-1 pr-2 font-medium">Barang</th>
                          <th scope="col" className="py-1 pr-2 font-medium text-right">Qty/unit lama</th>
                          <th scope="col" className="py-1 pr-2 font-medium text-right">Qty/unit baru</th>
                          <th scope="col" className="py-1 pr-2 font-medium text-right">Kebutuhan baru</th>
                          <th scope="col" className="py-1 font-medium">Status cakupan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((line) => (
                          <tr key={line.itemId} className="border-t border-default">
                            <td className="py-1 pr-2">{line.itemName}</td>
                            <td className="py-1 pr-2 text-right">{line.oldQtyPerUnit}</td>
                            <td className="py-1 pr-2 text-right">{line.newQtyPerUnit}</td>
                            <td className="py-1 pr-2 text-right">{line.newNeededQty}</td>
                            <td className="py-1">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                  coverageTone(line.coverage),
                                )}
                              >
                                {coverageLabel(line.coverage)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p role="note" className="text-xs text-muted-foreground">
                  Status cakupan hanya tampilan untuk pertimbangan Anda; pengajuan ini tidak membuat
                  reservasi stok.
                </p>
              </div>
            ) : toRevisionId ? (
              <p role="note" className="text-sm text-muted-foreground">
                Pratinjau selisih revisi belum tampil; pengajuan belum dapat dikirim.
              </p>
            ) : (
              <p role="note" className="text-sm text-muted-foreground">
                Pilih revisi tujuan untuk melihat pratinjau selisih sebelum mengirim pengajuan.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" isDisabled={isPending} onPress={() => setFormOpen(false)}>
                Batal
              </Button>
              <Button
                variant="primary"
                isDisabled={isBomRevisionSubmitDisabled({ isPending, previewLoading, preview, toRevisionId, reason })}
                onPress={submitRequest}
              >
                Kirim Pengajuan
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={!!approveFor}
        onOpenChange={(open) => {
          if (!open) setApproveFor(null)
        }}
        title="Setujui ganti revisi BOM?"
        variant="primary"
        confirmLabel="Setujui"
        cancelLabel="Batal"
        isPending={isPending}
        body={
          approveFor
            ? `Pin revisi dokumen diganti dari ${revLabel(approveFor.fromRevisionId)} ke ${revLabel(approveFor.toRevisionId)} dalam persetujuan ini.`
            : undefined
        }
        onConfirm={() => {
          if (!approveFor) return
          run(
            () => decideBomRevisionChange({ changeRequestId: approveFor.id, decision: "setujui" }),
            "Ganti revisi BOM disetujui; pin revisi diganti",
            () => setApproveFor(null),
          )
        }}
      />

      {rejectFor ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Tolak ganti revisi BOM"
        >
          <div className="w-full max-w-lg rounded-xl border border-default bg-surface p-5 shadow-lg flex flex-col gap-4">
            <h3 className="text-base font-semibold text-foreground">Tolak Ganti Revisi BOM</h3>
            <p className="text-sm text-muted-foreground">
              {revLabel(rejectFor.fromRevisionId)} → {revLabel(rejectFor.toRevisionId)} ·{" "}
              {rejectFor.reason}
            </p>
            <div className="flex flex-col gap-1">
              <label htmlFor="bom-change-reject-reason" className="text-sm font-medium text-foreground">
                Alasan penolakan <span aria-hidden="true" className="text-destructive">*</span>
              </label>
              <textarea
                id="bom-change-reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
                aria-required="true"
                rows={2}
                className="min-h-11 rounded-lg border border-default bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" isDisabled={isPending} onPress={() => setRejectFor(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                isDisabled={isPending || !rejectReason.trim()}
                onPress={() =>
                  run(
                    () =>
                      decideBomRevisionChange({
                        changeRequestId: rejectFor.id,
                        decision: "tolak",
                        decisionReason: rejectReason.trim(),
                      }),
                    "Ganti revisi BOM ditolak",
                    () => setRejectFor(null),
                  )
                }
              >
                Tolak Pengajuan
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
