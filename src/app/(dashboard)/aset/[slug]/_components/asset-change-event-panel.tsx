"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  postAssetChangeEventAction,
  postAssetReclassificationAction,
  reverseAssetChangeEventAction,
} from "@/actions/asset.actions"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import {
  ASSET_CHANGE_EVENT_KIND_LABELS,
  ASSET_CHANGE_EVENT_STATUS_LABELS,
  CHANGE_REASON_LABELS,
  IMPAIRMENT_INDICATOR_LABELS,
  RECLASSIFICATION_REASON_LABELS,
  RECOVERABLE_BASIS_LABELS,
  labelOf,
} from "../../_components/asset-change-event"

/** Baris riwayat terbekukan dari `AssetChangeEvent` — ditampilkan apa adanya. */
export interface AssetChangeEventRow {
  id: number
  kind: string
  status: string
  effectiveDate: string
  sourceDocumentKey: string
  journalNumber: string | null
  carryingBefore: string | null
  carryingAfter: string | null
  revaluationSurplusAfter: string | null
  fiscalBaseBefore: string | null
  fiscalBaseAfter: string | null
  finalTaxAmount: string | null
  finalTaxRatePercent: string | null
  surplusAccountCode: string | null
  impairmentLossAccountCode: string | null
  accumulatedImpairmentAccountCode: string | null
  taxPayableAccountCode: string | null
  fromCategoryName: string | null
  toCategoryName: string | null
  reasonCode: string | null
  approvedByName: string | null
  appraiserName: string | null
  impairmentIndicator: string | null
  recoverableBasis: string | null
  recoverableAmount: string | null
  djpApprovalNumber: string | null
  oldMethod: string | null
  newMethod: string | null
  newUsefulLifeMonths: number | null
  newResidualValue: string | null
  reversesEventId: number | null
}

export interface AssetChangeCategoryOption {
  id: number
  name: string
}

const EVENT_KINDS = [
  "REVALUATION_UP",
  "REVALUATION_DOWN",
  "IMPAIRMENT",
  "IMPAIRMENT_REVERSAL",
  "FISCAL_REVALUATION_APPROVED",
  "COMMERCIAL_METHOD_CHANGE",
  "FISCAL_METHOD_CHANGE",
  "ESTIMATE_CHANGE",
] as const

const METHOD_OPTIONS = [
  { value: "straight_line", label: "Garis lurus" },
  { value: "declining_balance", label: "Saldo menurun" },
  { value: "units_of_production", label: "Unit produksi" },
  { value: "sum_of_years_digits", label: "Jumlah angka tahun" },
]

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-base md:h-9 md:text-sm"

function money(value: string | null): string {
  return value == null ? "-" : formatCurrency(Number(value))
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

/**
 * Panel peristiwa perubahan aset: riwayat terbekukan per aset + form posting
 * peristiwa / reklasifikasi / pembalikan. UI hanya meneruskan isian pengguna
 * ke server action apa adanya; seluruh vonis jurnal, plafon, mapping akun,
 * dan pajak final diputuskan server (F-111-V/F-115-V/F-128-V).
 */
export function AssetChangeEventPanel({
  assetId,
  events,
  categories,
  currentCategoryId,
  canManage,
}: {
  assetId: number
  events: AssetChangeEventRow[]
  categories: AssetChangeCategoryOption[]
  currentCategoryId: number | null
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<"none" | "event" | "reclass">("none")
  const [kind, setKind] = useState<string>("REVALUATION_UP")
  const [reversalTarget, setReversalTarget] = useState<AssetChangeEventRow | null>(null)
  const [reversalDate, setReversalDate] = useState("")
  const [reversalKey, setReversalKey] = useState("")

  const isReval = kind === "REVALUATION_UP" || kind === "REVALUATION_DOWN" || kind === "FISCAL_REVALUATION_APPROVED"
  const isImpair = kind === "IMPAIRMENT" || kind === "IMPAIRMENT_REVERSAL"
  const isFiscal = kind === "FISCAL_REVALUATION_APPROVED" || kind === "FISCAL_METHOD_CHANGE"
  const isMethod = kind === "COMMERCIAL_METHOD_CHANGE" || kind === "FISCAL_METHOD_CHANGE"
  const isChange = isMethod || kind === "ESTIMATE_CHANGE"

  function submitResult(res: { success: boolean; error?: string; journalNumber?: string | null } | undefined, okText: string) {
    if (res?.success) {
      showSuccess(res.journalNumber ? `${okText} — jurnal ${res.journalNumber}` : okText)
      setMode("none")
      setReversalTarget(null)
      router.refresh()
    } else {
      showError(res?.error || "Peristiwa aset gagal diproses")
    }
  }

  function onEventSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        submitResult(await postAssetChangeEventAction(formData), "Peristiwa perubahan aset terposting")
      } catch (err) {
        showError(err instanceof Error ? err.message : "Peristiwa aset gagal diproses")
      }
    })
  }

  function onReclassSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        submitResult(await postAssetReclassificationAction(formData), "Reklasifikasi aset terposting")
      } catch (err) {
        showError(err instanceof Error ? err.message : "Reklasifikasi aset gagal diproses")
      }
    })
  }

  function onReversalConfirm() {
    if (!reversalTarget) return
    const formData = new FormData()
    formData.set("eventId", String(reversalTarget.id))
    formData.set("reversalDate", reversalDate)
    formData.set("sourceDocumentKey", reversalKey)
    startTransition(async () => {
      try {
        submitResult(await reverseAssetChangeEventAction(formData), "Pembalikan peristiwa terposting")
      } catch (err) {
        showError(err instanceof Error ? err.message : "Pembalikan peristiwa gagal diproses")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {events.length === 0 ? (
        <EmptyState title="Belum ada peristiwa perubahan aset" className="py-10" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm" aria-label="Riwayat peristiwa perubahan aset">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">Tanggal Efektif</th>
                <th className="px-2 py-2 font-medium">Jenis</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 text-right font-medium">Tercatat Sebelum</th>
                <th className="px-2 py-2 text-right font-medium">Tercatat Sesudah</th>
                <th className="px-2 py-2 text-right font-medium">Surplus Revaluasi Sesudah</th>
                <th className="px-2 py-2 font-medium">Dokumen Sumber</th>
                <th className="px-2 py-2 font-medium">Jurnal</th>
                {canManage && <th className="px-2 py-2 font-medium">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-default/60 align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate(ev.effectiveDate)}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-foreground">{labelOf(ASSET_CHANGE_EVENT_KIND_LABELS, ev.kind)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        ev.kind === "RECLASSIFICATION"
                          ? `${ev.fromCategoryName ?? "?"} → ${ev.toCategoryName ?? "?"}`
                          : null,
                        ev.kind === "RECLASSIFICATION"
                          ? labelOf(RECLASSIFICATION_REASON_LABELS, ev.reasonCode) !== "-"
                            ? labelOf(RECLASSIFICATION_REASON_LABELS, ev.reasonCode)
                            : null
                          : isChangeReason(ev)
                            ? labelOf(CHANGE_REASON_LABELS, ev.reasonCode) !== "-"
                              ? labelOf(CHANGE_REASON_LABELS, ev.reasonCode)
                              : null
                            : null,
                        ev.appraiserName ? `Penilai: ${ev.appraiserName}` : null,
                        ev.impairmentIndicator
                          ? `Indikator: ${labelOf(IMPAIRMENT_INDICATOR_LABELS, ev.impairmentIndicator)}`
                          : null,
                        ev.recoverableBasis
                          ? `Terpulihkan (${labelOf(RECOVERABLE_BASIS_LABELS, ev.recoverableBasis)}): ${money(ev.recoverableAmount)}`
                          : null,
                        ev.newMethod ? `Metode: ${ev.oldMethod ?? "-"} → ${ev.newMethod}` : null,
                        ev.newUsefulLifeMonths != null ? `Masa manfaat baru: ${ev.newUsefulLifeMonths} bulan` : null,
                        ev.newResidualValue != null ? `Residu baru: ${money(ev.newResidualValue)}` : null,
                        ev.djpApprovalNumber ? `Persetujuan DJP: ${ev.djpApprovalNumber}` : null,
                        ev.approvedByName ? `Disetujui: ${ev.approvedByName}` : null,
                        ev.reversesEventId != null ? `Membalik peristiwa #${ev.reversesEventId}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "-"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        ev.surplusAccountCode ? `Surplus ${ev.surplusAccountCode}` : null,
                        ev.impairmentLossAccountCode ? `Beban PN ${ev.impairmentLossAccountCode}` : null,
                        ev.accumulatedImpairmentAccountCode ? `Akm. PN ${ev.accumulatedImpairmentAccountCode}` : null,
                        ev.taxPayableAccountCode ? `Utang PPh ${ev.taxPayableAccountCode}` : null,
                        ev.fiscalBaseBefore != null || ev.fiscalBaseAfter != null
                          ? `Basis fiskal: ${money(ev.fiscalBaseBefore)} → ${money(ev.fiscalBaseAfter)}`
                          : null,
                        ev.finalTaxAmount != null
                          ? `PPh final${ev.finalTaxRatePercent != null ? ` ${ev.finalTaxRatePercent}%` : ""}: ${money(ev.finalTaxAmount)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="px-2 py-2">{labelOf(ASSET_CHANGE_EVENT_STATUS_LABELS, ev.status)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{money(ev.carryingBefore)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{money(ev.carryingAfter)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{money(ev.revaluationSurplusAfter)}</td>
                  <td className="px-2 py-2 font-mono text-xs break-all">{ev.sourceDocumentKey}</td>
                  <td className="px-2 py-2 font-mono text-xs">{ev.journalNumber ?? "-"}</td>
                  {canManage && (
                    <td className="px-2 py-2 whitespace-nowrap">
                      {ev.status === "POSTED" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          isDisabled={isPending}
                          onPress={() => {
                            setReversalTarget(ev)
                            setReversalDate("")
                            setReversalKey("")
                          }}
                        >
                          Balik Peristiwa
                        </Button>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && mode === "none" && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="primary" onPress={() => setMode("event")}>
            Catat Peristiwa Perubahan
          </Button>
          <Button type="button" variant="secondary" onPress={() => setMode("reclass")}>
            Reklasifikasi Kategori
          </Button>
        </div>
      )}

      {canManage && mode === "event" && (
        <form
          onSubmit={onEventSubmit}
          aria-label="Formulir peristiwa perubahan aset"
          aria-busy={isPending}
          className="flex flex-col gap-3 rounded-lg border border-default bg-surface p-3"
        >
          <input type="hidden" name="assetId" value={assetId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="ace-kind" label="Jenis Peristiwa *">
              <select id="ace-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_CHANGE_EVENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ace-effectiveDate" label="Tanggal Efektif *">
              <Input id="ace-effectiveDate" name="effectiveDate" type="date" required />
            </Field>
            <Field id="ace-sourceDocumentKey" label="Kunci Dokumen Sumber *">
              <Input id="ace-sourceDocumentKey" name="sourceDocumentKey" required placeholder="cth. LAP-PENILAI-2026-001" />
            </Field>

            {isReval && (
              <>
                <Field id="ace-fairValue" label="Nilai Wajar (laporan penilai) *">
                  <Input id="ace-fairValue" name="fairValue" type="number" step="0.01" min="0" required placeholder="0" />
                </Field>
                <Field id="ace-appraiserName" label="Nama Penilai *">
                  <Input id="ace-appraiserName" name="appraiserName" required placeholder="Nama penilai / KJPP" />
                </Field>
                <Field id="ace-appraiserReportRef" label="Rujukan Laporan Penilai *">
                  <Input id="ace-appraiserReportRef" name="appraiserReportRef" required placeholder="Nomor laporan penilai" />
                </Field>
                <Field id="ace-revaluedClassName" label="Kelas Aset Direvaluasi *">
                  <Input id="ace-revaluedClassName" name="revaluedClassName" required placeholder="Nama kelas aset" />
                </Field>
              </>
            )}

            {isImpair && (
              <>
                <Field id="ace-impairmentIndicator" label="Indikator Penurunan Nilai *">
                  <select id="ace-impairmentIndicator" name="impairmentIndicator" required defaultValue="" className={selectClass}>
                    <option value="" disabled>
                      -- Pilih indikator --
                    </option>
                    {Object.entries(IMPAIRMENT_INDICATOR_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="ace-recoverableBasis" label="Dasar Jumlah Terpulihkan *">
                  <select id="ace-recoverableBasis" name="recoverableBasis" required defaultValue="" className={selectClass}>
                    <option value="" disabled>
                      -- Pilih dasar --
                    </option>
                    {Object.entries(RECOVERABLE_BASIS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="ace-recoverableAmount" label="Jumlah Terpulihkan *">
                  <Input id="ace-recoverableAmount" name="recoverableAmount" type="number" step="0.01" min="0" required placeholder="0" />
                </Field>
                {kind === "IMPAIRMENT_REVERSAL" && (
                  <>
                    <Field id="ace-carryingWithoutImpairment" label="Nilai Tercatat Tanpa Penurunan Nilai (plafon) *">
                      <Input id="ace-carryingWithoutImpairment" name="carryingWithoutImpairment" type="number" step="0.01" min="0" required placeholder="0" />
                    </Field>
                    <div className="flex items-center gap-2 pt-6">
                      <input id="ace-isGoodwill" name="isGoodwillOrNonAmortizing" type="checkbox" value="true" className="size-4 min-h-11 min-w-11 rounded border-default sm:min-h-4 sm:min-w-4" />
                      <Label htmlFor="ace-isGoodwill">Goodwill / tak berwujud tanpa amortisasi</Label>
                    </div>
                  </>
                )}
              </>
            )}

            {isFiscal && (
              <>
                <Field id="ace-djpApprovalNumber" label="Nomor Persetujuan DJP *">
                  <Input id="ace-djpApprovalNumber" name="djpApprovalNumber" required placeholder="Nomor keputusan DJP" />
                </Field>
                <Field id="ace-djpApprovalDate" label="Tanggal Persetujuan DJP *">
                  <Input id="ace-djpApprovalDate" name="djpApprovalDate" type="date" required />
                </Field>
              </>
            )}

            {isChange && (
              <>
                <Field id="ace-reasonCode" label="Alasan Perubahan *">
                  <select id="ace-reasonCode" name="reasonCode" required defaultValue="" className={selectClass}>
                    <option value="" disabled>
                      -- Pilih alasan --
                    </option>
                    {Object.entries(CHANGE_REASON_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="ace-approvedByName" label="Penelaah / Penyetuju *">
                  <Input id="ace-approvedByName" name="approvedByName" required placeholder="Nama penelaah" />
                </Field>
              </>
            )}

            {isMethod && (
              <Field id="ace-newMethod" label="Metode Baru *">
                <select id="ace-newMethod" name="newMethod" required defaultValue="" className={selectClass}>
                  <option value="" disabled>
                    -- Pilih metode --
                  </option>
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {kind === "FISCAL_METHOD_CHANGE" && (
              <div className="flex items-center gap-2 pt-6">
                <input id="ace-isBuildingFiscal" name="isBuildingFiscal" type="checkbox" value="true" className="size-4 min-h-11 min-w-11 rounded border-default sm:min-h-4 sm:min-w-4" />
                <Label htmlFor="ace-isBuildingFiscal">Aset bangunan (fiskal)</Label>
              </div>
            )}

            {kind === "ESTIMATE_CHANGE" && (
              <>
                <Field id="ace-newUsefulLifeMonths" label="Masa Manfaat Baru (bulan)">
                  <Input id="ace-newUsefulLifeMonths" name="newUsefulLifeMonths" type="number" step="1" min="1" placeholder="cth. 96" />
                </Field>
                <Field id="ace-newResidualValue" label="Nilai Residu Baru">
                  <Input id="ace-newResidualValue" name="newResidualValue" type="number" step="0.01" min="0" placeholder="0" />
                </Field>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Nilai, plafon, mapping akun, dan jurnal diputuskan server dari dokumen sumber di atas. Penolakan server tampil apa adanya.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" isDisabled={isPending}>
              {isPending ? "Memposting..." : "Posting Peristiwa"}
            </Button>
            <Button type="button" variant="secondary" isDisabled={isPending} onPress={() => setMode("none")}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {canManage && mode === "reclass" && (
        <form
          onSubmit={onReclassSubmit}
          aria-label="Formulir reklasifikasi aset"
          aria-busy={isPending}
          className="flex flex-col gap-3 rounded-lg border border-default bg-surface p-3"
        >
          <input type="hidden" name="assetId" value={assetId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="acr-toCategoryId" label="Kategori Tujuan *">
              <select id="acr-toCategoryId" name="toCategoryId" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  -- Pilih kategori tujuan --
                </option>
                {categories
                  .filter((c) => c.id !== currentCategoryId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field id="acr-effectiveDate" label="Tanggal Efektif *">
              <Input id="acr-effectiveDate" name="effectiveDate" type="date" required />
            </Field>
            <Field id="acr-sourceDocumentKey" label="Kunci Dokumen Sumber *">
              <Input id="acr-sourceDocumentKey" name="sourceDocumentKey" required placeholder="cth. BA-REKLAS-2026-001" />
            </Field>
            <Field id="acr-reasonCode" label="Alasan Reklasifikasi *">
              <select id="acr-reasonCode" name="reasonCode" required defaultValue="" className={selectClass}>
                <option value="" disabled>
                  -- Pilih alasan --
                </option>
                {Object.entries(RECLASSIFICATION_REASON_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="acr-approvedByName" label="Penyetuju Reklasifikasi *">
              <Input id="acr-approvedByName" name="approvedByName" required placeholder="Nama penyetuju" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" isDisabled={isPending}>
              {isPending ? "Memposting..." : "Posting Reklasifikasi"}
            </Button>
            <Button type="button" variant="secondary" isDisabled={isPending} onPress={() => setMode("none")}>
              Batal
            </Button>
          </div>
        </form>
      )}

      <ConfirmDialog
        isOpen={reversalTarget != null}
        onOpenChange={(open) => {
          if (!open) setReversalTarget(null)
        }}
        title="Balik peristiwa perubahan aset?"
        variant="danger"
        confirmLabel="Balik Peristiwa"
        isPending={isPending}
        onConfirm={onReversalConfirm}
      >
        <div className="flex flex-col gap-3">
          <p>
            Peristiwa {reversalTarget ? labelOf(ASSET_CHANGE_EVENT_KIND_LABELS, reversalTarget.kind) : ""} tanggal{" "}
            {reversalTarget ? formatDate(reversalTarget.effectiveDate) : ""} akan dibalik lewat jurnal pembalik pada periode terbuka.
            Baris peristiwa asal tidak diubah.
          </p>
          <Field id="ace-reversalDate" label="Tanggal Pembalikan *">
            <Input
              id="ace-reversalDate"
              type="date"
              required
              value={reversalDate}
              onChange={(e) => setReversalDate(e.target.value)}
            />
          </Field>
          <Field id="ace-reversalKey" label="Kunci Dokumen Sumber Pembalikan *">
            <Input
              id="ace-reversalKey"
              required
              value={reversalKey}
              onChange={(e) => setReversalKey(e.target.value)}
              placeholder="cth. BA-BALIK-2026-001"
            />
          </Field>
        </div>
      </ConfirmDialog>
    </div>
  )
}

function isChangeReason(ev: AssetChangeEventRow): boolean {
  return ev.kind === "COMMERCIAL_METHOD_CHANGE" || ev.kind === "FISCAL_METHOD_CHANGE" || ev.kind === "ESTIMATE_CHANGE"
}
