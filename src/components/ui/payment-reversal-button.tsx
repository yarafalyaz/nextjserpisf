"use client"

import { useState } from "react"
import { reverseVendorPayment } from "@/actions/purchase.actions"
import { reverseSalesPayment } from "@/actions/sales.actions"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { showError } from "@/lib/utils/toast"
import { useActionRunner } from "@/components/reports/use-action-runner"

type PaymentKind = "vendor" | "sales"

const KIND_COPY: Record<
  PaymentKind,
  { label: string; effect: string; idemScope: string; success: string }
> = {
  vendor: {
    label: "pembayaran pemasok",
    effect:
      "Jurnal asal dibalik dengan jurnal lawan, saldo tiap tagihan kembali, dan dokumen asal tetap tersimpan sebagai histori berstatus dibalik. Alasan wajib diisi dan tercatat.",
    idemScope: "vendor-payment-reverse",
    success: "Pembayaran pemasok dibalik. Saldo tagihan kembali.",
  },
  sales: {
    label: "pembayaran penjualan",
    effect:
      "Jurnal asal dibalik dengan jurnal lawan, piutang faktur kembali terbuka, dan dokumen asal tetap tersimpan sebagai histori berstatus dibalik. Bila ada bukti potong aktif, batalkan bukti potong dulu. Alasan wajib diisi dan tercatat.",
    idemScope: "sales-payment-reverse",
    success: "Pembayaran penjualan dibalik. Piutang faktur kembali.",
  },
}

/**
 * FIN-BR-008: tombol Balikkan + dialog alasan wajib untuk pembayaran
 * terposting. Konsumen UI dari `reverseVendorPayment` /
 * `reverseSalesPayment` (PR #1233, vonis t_9a1c4453 — server penegak
 * tunggal: status, periode terkunci, bupot aktif). UI tidak menilai
 * ulang kelayakan selain pintu tampil: vendor hanya `completed`,
 * sales selain `reversed`; penolakan server tampil verbatim.
 * `canReverse` dicerminkan page dari izin yang sama dengan server
 * (vendor: `delete_vendor_payments`, sales: `delete_sales_payments`).
 * Kunci idempotensi dibuat sekali per sesi dialog agar ulangan klik /
 * submit ganda pada alasan yang sama menjadi replay server, bukan
 * pembalikan ganda; dialog yang dibuka ulang = kunci baru.
 */
export function PaymentReversalButton({
  kind,
  id,
  documentNo,
  status,
  canReverse,
}: Readonly<{
  kind: PaymentKind
  id: number
  documentNo: string
  status: string
  canReverse: boolean
}>) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [idemKey, setIdemKey] = useState("")
  const { isPending, run } = useActionRunner("Gagal membalik pembayaran. Silakan coba lagi.")

  const eligible = kind === "vendor" ? status === "completed" : status !== "reversed"
  if (!eligible || !canReverse) return null

  const copy = KIND_COPY[kind]
  const fieldId = `payment-reversal-reason-${kind}-${id}`

  function openDialog() {
    setReason("")
    setIdemKey(crypto.randomUUID())
    setOpen(true)
  }

  function submitReversal() {
    const trimmed = reason.trim()
    if (!trimmed) {
      // Cermin pesan server: tolak sebelum memanggil aksi.
      showError("Alasan pembalikan pembayaran wajib diisi.")
      return
    }
    run(
      () =>
        kind === "vendor"
          ? reverseVendorPayment(id, trimmed, idemKey)
          : reverseSalesPayment(id, trimmed, idemKey),
      copy.success,
      () => {
        setOpen(false)
        setReason("")
        setIdemKey("")
      },
    )
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex min-h-11 items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10 transition-all disabled:opacity-50"
        disabled={isPending}
        aria-label={`Balikkan pembayaran ${documentNo}`}
        onClick={openDialog}
      >
        Balikkan Pembayaran
      </button>

      <ConfirmDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={`Balikkan pembayaran ${documentNo}?`}
        confirmLabel="Ya, Balikkan"
        variant="danger"
        isPending={isPending}
        onConfirm={submitReversal}
      >
        <div className="flex flex-col gap-3">
          <p>{copy.effect}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fieldId}>Alasan Pembalikan</Label>
            <Textarea
              id={fieldId}
              rows={3}
              required
              aria-required="true"
              aria-invalid={reason.trim() === "" ? true : undefined}
              aria-describedby={reason.trim() === "" ? `${fieldId}-hint` : undefined}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Contoh: salah nominal pada ${copy.label} ini.`}
            />
          </div>
          {reason.trim() === "" ? (
            <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
              Isi alasan untuk melanjutkan.
            </p>
          ) : null}
        </div>
      </ConfirmDialog>
    </>
  )
}

/**
 * FIN-BR-008: penanda + pintu read-only pembayaran `reversed`, dipakai
 * halaman detail + ubah kedua domain (penjualan + vendor) agar salinan
 * syarat `status !== "reversed"` tidak berlipat di tiap page.
 */
export function HideWhenReversed({
  status,
  children,
}: Readonly<{ status: string; children: React.ReactNode }>) {
  if (status === "reversed") return null
  return <>{children}</>
}

/**
 * FIN-BR-008: cabang read-only halaman ubah — `reversed` tampil penanda,
 * selain itu render form yang diberikan. Satu cabang, bukan salinan
 * ternary `data.status === "reversed"` di tiap halaman ubah.
 */
export function ReversedOrForm({
  status,
  reversalReason,
  reversedAt,
  children,
}: Readonly<{
  status: string
  reversalReason?: string | null
  reversedAt?: Date | string | null
  children: React.ReactNode
}>) {
  if (status === "reversed") {
    return (
      <PaymentReversalNotice
        status={status}
        reversalReason={reversalReason}
        reversedAt={reversedAt}
      />
    )
  }
  return <>{children}</>
}

/**
 * FIN-BR-008: penanda read-only pembayaran berstatus `reversed`.
 * Alasan + tanggal tampil verbatim dari kolom histori server
 * (`reversalReason`/`reversedAt`); tanpa keduanya komponen kosong —
 * UI tidak mengarang histori. `reversedBy` adalah ID pengguna tanpa
 * relasi nama di schema, jadi tidak dirender sebagai nama.
 */
export function PaymentReversalNotice({
  status,
  reversalReason,
  reversedAt,
}: Readonly<{
  status: string
  reversalReason?: string | null
  reversedAt?: Date | string | null
}>) {
  if (status !== "reversed") return null
  return (
    <div
      role="note"
      aria-label="Pembayaran sudah dibalik"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 px-5 text-sm"
    >
      <p className="font-semibold text-destructive">Pembayaran ini sudah dibalik (read-only).</p>
      <p className="mt-1 text-muted-foreground">
        Dokumen asal dipertahankan sebagai histori dan tidak dapat diubah atau dihapus. Koreksi
        dilakukan dengan pembayaran baru.
      </p>
      {reversalReason ? (
        <p className="mt-2">
          <span className="font-medium">Alasan pembalikan:</span> {reversalReason}
        </p>
      ) : null}
      {reversedAt ? (
        <p className="mt-1">
          <span className="font-medium">Dibalik pada:</span>{" "}
          {new Date(reversedAt).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      ) : null}
    </div>
  )
}
