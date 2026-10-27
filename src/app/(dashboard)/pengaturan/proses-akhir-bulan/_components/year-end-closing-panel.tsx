"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { BookCheck, ClipboardCheck, Undo2 } from "lucide-react"

import {
  postYearEndClosingAction,
  requestYearEndClosingApprovalAction,
  reverseYearEndClosingAction,
} from "@/actions/year-end-closing.actions"
import { Button } from "@/components/ui/shadcn/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormSelect } from "@/components/ui/form-select"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import type { YearEndClosingPreview } from "@/lib/reports/year-end-closing"

/** Preview serializable dari RSC: closingDate dikirim sebagai ISO string. */
export type YearEndClosingPreviewView = Omit<YearEndClosingPreview, "closingDate"> & {
  closingDate: string
}

type ActionKind = "approval" | "post" | "reverse"

export function YearEndClosingPanel({ preview }: { preview: YearEndClosingPreviewView }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState<ActionKind | null>(null)
  const [confirming, setConfirming] = useState<ActionKind | null>(null)

  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 7 }, (_, i) => {
    const year = currentYear - 3 + i
    return { value: String(year), label: String(year) }
  })

  function changeYear(value: string) {
    if (!/^\d{4}$/.test(value)) return
    router.push(`/pengaturan/proses-akhir-bulan/tahun/${value}`)
  }

  const postDisabledReason = preview.alreadyClosed
    ? "Tahun fiskal ini sudah ditutup."
    : !preview.retainedEarningsMapped
      ? "Akun laba ditahan belum dipetakan di Pengaturan (Mapping Akun)."
      : !preview.balanced
        ? "Pratinjau belum seimbang; posting ditolak sampai selisih nol."
        : null
  const postDisabled = isPending || postDisabledReason !== null

  function run(kind: ActionKind) {
    setConfirming(null)
    setBusy(kind)
    startTransition(async () => {
      const formData = new FormData()
      formData.set("fiscalYear", String(preview.fiscalYear))
      const result =
        kind === "approval"
          ? await requestYearEndClosingApprovalAction(formData)
          : kind === "post"
            ? await postYearEndClosingAction(formData)
            : await reverseYearEndClosingAction(formData)
      setBusy(null)
      if (result.success) {
        showSuccess(result.message ?? "Berhasil.")
        router.refresh()
      } else {
        showError(result.error ?? "Gagal memproses penutup tahun.")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sm:max-w-xs">
        <label htmlFor="year-end-closing-year" className="mb-1.5 block text-sm font-medium text-foreground">
          Tahun fiskal
        </label>
        <FormSelect
          id="year-end-closing-year"
          name="tahun"
          value={String(preview.fiscalYear)}
          onValueChange={changeYear}
          options={yearOptions}
          disabled={isPending}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Tanggal penutup {formatDate(preview.closingDate)}. Laba bersih tahun ini{" "}
        {formatCurrency(preview.netProfit)} akan ditutup ke akun laba ditahan per pusat laba.
      </p>

      {preview.lines.length === 0 ? (
        <EmptyState title="Belum ada saldo akun pendapatan/beban terposting untuk tahun fiskal ini" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Akun</th>
                <th className="px-3 py-2 font-medium">Pusat laba</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
                <th className="px-3 py-2 text-right font-medium">Debit penutup</th>
                <th className="px-3 py-2 text-right font-medium">Kredit penutup</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={`${line.accountId}-${line.profitCenterId ?? "null"}`} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {line.accountCode} - {line.accountName}
                  </td>
                  <td className="px-3 py-2">{line.profitCenterCode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(line.balance)}</td>
                  <td className="px-3 py-2 text-right">
                    {line.closingDirection === "debit" ? formatCurrency(line.closingAmount) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.closingDirection === "credit" ? formatCurrency(line.closingAmount) : "—"}
                  </td>
                </tr>
              ))}
              {preview.retainedLines.map((line) => (
                <tr key={`retained-${line.profitCenterId ?? "null"}`} className="border-b bg-muted/20 last:border-0">
                  <td className="px-3 py-2 font-medium">Laba ditahan (lawan penutup)</td>
                  <td className="px-3 py-2">{line.profitCenterCode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(line.netProfit)}</td>
                  <td className="px-3 py-2 text-right">
                    {line.direction === "debit" ? formatCurrency(Math.abs(line.netProfit)) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {line.direction === "credit" ? formatCurrency(Math.abs(line.netProfit)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">{formatCurrency(preview.totalDebit)}</td>
                <td className="px-3 py-2 text-right">{formatCurrency(preview.totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!preview.balanced ? (
        <p className="text-xs text-destructive">
          Pratinjau belum seimbang: selisih {formatCurrency(preview.difference)}.
        </p>
      ) : null}
      {!preview.retainedEarningsMapped ? (
        <p className="text-xs text-destructive">
          Akun laba ditahan belum dipetakan. Petakan akun ekuitas laba ditahan di Pengaturan → Mapping Akun.
        </p>
      ) : null}
      {preview.alreadyClosed ? (
        <p className="text-xs text-muted-foreground">
          Jurnal penutup tahun fiskal ini sudah terposting. Koreksi hanya lewat reversal penutup tahun di bawah.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {!preview.alreadyClosed ? (
          <>
            <Button variant="outline" onClick={() => setConfirming("approval")} disabled={isPending}>
              <ClipboardCheck className="size-4" />
              {busy === "approval" ? "Mengajukan…" : "Ajukan persetujuan"}
            </Button>
            <Button onClick={() => setConfirming("post")} disabled={postDisabled}>
              <BookCheck className="size-4" />
              {busy === "post" ? "Memposting…" : `Posting penutup ${preview.fiscalYear}`}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirming("reverse")} disabled={isPending}>
            <Undo2 className="size-4" />
            {busy === "reverse" ? "Membalik…" : `Reversal penutup ${preview.fiscalYear}`}
          </Button>
        )}
      </div>
      {postDisabledReason && !preview.alreadyClosed ? (
        <p className="text-xs text-muted-foreground">{postDisabledReason}</p>
      ) : null}

      <ConfirmDialog
        isOpen={confirming === "approval"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title={`Ajukan persetujuan penutup tahun ${preview.fiscalYear}?`}
        body="Pengajuan masuk ke alur persetujuan terkonfigurasi; tanpa alur aktif, posting dapat langsung dilakukan pemegang izin."
        confirmLabel="Ajukan persetujuan"
        variant="primary"
        isPending={busy === "approval"}
        onConfirm={() => run("approval")}
      />
      <ConfirmDialog
        isOpen={confirming === "post"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title={`Posting jurnal penutup tahun ${preview.fiscalYear}?`}
        body="Satu jurnal penutup terposting dibuat: akun pendapatan/beban ditutup ke laba ditahan per pusat laba. Koreksi sesudahnya hanya lewat reversal penuh."
        confirmLabel="Posting penutup"
        variant="warning"
        isPending={busy === "post"}
        onConfirm={() => run("post")}
      />
      <ConfirmDialog
        isOpen={confirming === "reverse"}
        onOpenChange={(open) => { if (!open) setConfirming(null) }}
        title={`Reversal jurnal penutup tahun ${preview.fiscalYear}?`}
        body="Jurnal penutup dibalik penuh dan jurnal asli berstatus dibalik. Saldo akun pendapatan/beban tahun ini kembali terbuka."
        confirmLabel="Reversal penutup"
        variant="danger"
        isPending={busy === "reverse"}
        onConfirm={() => run("reverse")}
      />
    </div>
  )
}
