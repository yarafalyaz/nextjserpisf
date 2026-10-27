"use client"

import { useState } from "react"

import {
  linkSupplierClaimAction,
  transitionSupplierClaimAction,
} from "@/actions/warranty.actions"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormSelect } from "@/components/ui/form-select"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { useWarrantyAction } from "./warranty-submit"

export interface SupplierClaimFacts {
  claimId: number
  /** Status klaim pelanggan — recovery supplier TERPISAH dari ini. */
  claimStatus: string
  resolutionType: string | null
  supplierClaimStatus: string
  vendorName: string | null
  purchaseReturnLabel: string | null
  supplierClaimRefNo: string | null
  supplierClaimNotes: string | null
  supplierClaimByName: string | null
  supplierClaimAt: string | null
  attachmentCount: number
}

export interface SupplierClaimOption {
  value: string
  label: string
}

const SUPPLIER_CLAIM_LABELS: Record<string, string> = {
  none: "Belum ditautkan",
  drafted: "Draf klaim supplier",
  sent: "Terkirim ke supplier",
  accepted: "Diterima supplier",
  rejected_supplier: "Ditolak supplier",
  returned: "Part sudah diretur",
  closed_recovered: "Tutup — recovery diterima",
  closed_no_recovery: "Tutup — tanpa recovery",
}

// Transisi recovery dari warranty.service (R1–R8) ditampilkan apa adanya;
// guard bukti/izin tetap ditegakkan server — UI tidak menghitung ulang.
// ponytail: peta transisi disalin dari service; bila service berubah,
// perbarui peta ini di PR yang sama (tes panel mengunci label+tujuan).
const SUPPLIER_CLAIM_TARGETS: Record<string, { value: string; label: string }[]> = {
  drafted: [
    { value: "sent", label: "Kirim ke Supplier" },
    { value: "none", label: "Lepas Tautan" },
  ],
  sent: [
    { value: "accepted", label: "Catat Diterima Supplier" },
    { value: "rejected_supplier", label: "Catat Ditolak Supplier" },
  ],
  accepted: [
    { value: "returned", label: "Catat Part Sudah Diretur" },
    { value: "closed_recovered", label: "Tutup — Recovery Diterima" },
    { value: "closed_no_recovery", label: "Tutup — Tanpa Recovery" },
  ],
  rejected_supplier: [{ value: "closed_no_recovery", label: "Tutup — Tanpa Recovery" }],
  returned: [{ value: "closed_recovered", label: "Tutup — Recovery Diterima" }],
}

/**
 * Panel klaim supplier part cacat (F-2026-10-21-022 tahap UI).
 *
 * Status recovery TERPISAH dari status klaim pelanggan: panel ini tidak
 * menyentuh status utama klaim. Tautan lahir hanya sesudah klaim disetujui
 * beresolusi replace (guard service), retur hanya DITAUTKAN dari retur
 * draft existing — retur tidak dibuat di sini. `sent` butuh nomor
 * referensi/resi + foto bukti di panel lampiran; penolakannya tampil
 * verbatim dari server. Gating: tautkan/lepas/transisi pencatatan dari
 * izin edit, kirim + tutup tanpa recovery dari izin approve (server
 * menegakkan lagi; tombol disembunyikan tanpa izin supaya aksi yang
 * pasti ditolak tidak ditawarkan).
 */
export function WarrantySupplierClaimPanel({
  facts,
  vendorOptions,
  purchaseReturnOptions,
  canLink,
  canApprove,
}: {
  facts: SupplierClaimFacts
  vendorOptions: SupplierClaimOption[]
  purchaseReturnOptions: SupplierClaimOption[]
  canLink: boolean
  canApprove: boolean
}) {
  const { isPending, run } = useWarrantyAction("Gagal memproses klaim supplier")
  const [vendorId, setVendorId] = useState("")
  const [purchaseReturnId, setPurchaseReturnId] = useState("")
  const [transitionTo, setTransitionTo] = useState("")
  const [confirmTo, setConfirmTo] = useState<string | null>(null)
  // Snapshot field form saat dialog konfirmasi dibuka: transisi terkonfirmasi
  // wajib membawa refNo/catatan yang diketik user (teks form menjanjikan
  // alasan pada catatan wajib terisi) — FormData kosong membuangnya diam-diam.
  const [confirmData, setConfirmData] = useState<FormData | null>(null)

  const status = facts.supplierClaimStatus
  const supplierStatusLabel = SUPPLIER_CLAIM_LABELS[status] ?? status
  const isTerminal = status === "closed_recovered" || status === "closed_no_recovery"
  const eligibleForLink =
    ["approved", "in_repair", "closed"].includes(facts.claimStatus) &&
    facts.resolutionType === "replace"
  const showLinkForm = canLink && status === "none" && eligibleForLink
  const showIneligibleNote = canLink && status === "none" && !eligibleForLink
  const targets = SUPPLIER_CLAIM_TARGETS[status] ?? []
  const visibleTargets = targets.filter((t) =>
    t.value === "sent" || t.value === "closed_no_recovery" ? canApprove : canLink,
  )
  const showTransitionForm = !isTerminal && status !== "none" && visibleTargets.length > 0
  const confirmTarget = targets.find((t) => t.value === confirmTo)

  function handleLink(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("claimId", String(facts.claimId))
    formData.set("supplierClaimVendorId", vendorId)
    formData.set("purchaseReturnId", purchaseReturnId)
    run(linkSupplierClaimAction, formData, "Klaim supplier ditautkan")
  }

  function handleTransition(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("claimId", String(facts.claimId))
    formData.set("to", transitionTo)
    run(transitionSupplierClaimAction, formData, "Status klaim supplier diperbarui")
  }

  function runConfirmedTransition() {
    if (!confirmTo) return
    const formData = confirmData ?? new FormData()
    formData.set("claimId", String(facts.claimId))
    formData.set("to", confirmTo)
    run(transitionSupplierClaimAction, formData, "Status klaim supplier diperbarui")
    setConfirmTo(null)
    setConfirmData(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Klaim supplier part cacat"
        className="bg-surface rounded-xl border border-default shadow-sm p-6"
      >
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Klaim Supplier Part Cacat</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Status recovery supplier terpisah dari status klaim pelanggan di atas — klaim pelanggan bisa
          ditutup sementara recovery supplier masih berjalan.
        </p>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Status Klaim Supplier
            </dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">{supplierStatusLabel}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor</dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {facts.vendorName ?? "Belum ditautkan"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Retur Pembelian Tertaut
            </dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {facts.purchaseReturnLabel ?? "Tidak ada retur tertaut"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nomor Referensi Klaim Supplier
            </dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {facts.supplierClaimRefNo ? (
                <span className="font-mono">{facts.supplierClaimRefNo}</span>
              ) : (
                "Belum ada nomor referensi tercatat"
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Terakhir Diperbarui Oleh
            </dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {facts.supplierClaimByName ?? "-"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Terakhir Diperbarui
            </dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {facts.supplierClaimAt ?? "-"}
            </dd>
          </div>
          {facts.supplierClaimNotes && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Catatan Klaim Supplier
              </dt>
              <dd className="whitespace-pre-wrap text-[0.9375rem] text-foreground">
                {facts.supplierClaimNotes}
              </dd>
              {facts.supplierClaimNotes.includes("[Resi pengiriman klaim supplier:") && (
                <p className="text-xs text-muted-foreground">
                  Baris [Resi pengiriman klaim supplier: ...] mencatat nomor resi pengiriman, bukan
                  nomor referensi persetujuan vendor.
                </p>
              )}
            </div>
          )}
        </dl>
        {status === "drafted" && (
          <p className="mt-4 text-sm text-muted-foreground">
            Sebelum mengirim: isi nomor referensi/resi pengiriman dan lampirkan foto part cacat pada panel
            lampiran di bawah ({facts.attachmentCount} lampiran tercatat). Kirim klaim supplier butuh izin
            persetujuan.
          </p>
        )}
      </section>

      {showIneligibleNote && (
        <p className="text-sm text-muted-foreground">
          Tautan klaim supplier hanya bisa dibuat sesudah klaim garansi disetujui dengan jenis penyelesaian
          penggantian part.
        </p>
      )}

      {showLinkForm && (
        <form
          onSubmit={handleLink}
          aria-busy={isPending}
          aria-label="Formulir tautan klaim supplier"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Tautkan Klaim Supplier</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierClaimVendorId">Vendor Supplier</Label>
              <FormSelect
                id="supplierClaimVendorId"
                aria-label="Vendor klaim supplier"
                value={vendorId}
                onValueChange={setVendorId}
                options={vendorOptions}
                placeholder="Pilih vendor supplier"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchaseReturnId">Retur Pembelian Draft (opsional)</Label>
              <FormSelect
                id="purchaseReturnId"
                aria-label="Retur pembelian draft"
                value={purchaseReturnId}
                onValueChange={setPurchaseReturnId}
                options={[
                  { value: "", label: "Tanpa retur — jalur vendor saja" },
                  ...purchaseReturnOptions,
                ]}
                placeholder="Tanpa retur — jalur vendor saja"
              />
              <p className="text-xs text-muted-foreground">
                Retur dibuat terpisah di modul pembelian; di sini retur draft yang sudah ada hanya
                ditautkan. Tanpa retur, catatan wajib menjelaskan ketiadaan PO asal.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierClaimRefNoLink">
                Nomor Referensi Klaim Supplier / Nomor Resi Pengiriman (opsional)
              </Label>
              <Input
                id="supplierClaimRefNoLink"
                name="supplierClaimRefNo"
                placeholder="Nomor klaim supplier atau nomor resi pengiriman"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="supplierClaimNotesLink">Catatan Klaim Supplier</Label>
              <Textarea
                id="supplierClaimNotesLink"
                name="supplierClaimNotes"
                rows={3}
                placeholder="Catatan untuk supplier; wajib diisi bila tanpa retur pembelian"
              />
            </div>
          </div>
          <div className="mt-6">
            <Button type="submit" isDisabled={isPending || !vendorId}>
              {isPending ? "Menyimpan..." : "Tautkan Klaim Supplier"}
            </Button>
          </div>
        </form>
      )}

      {showTransitionForm && (
        <form
          onSubmit={handleTransition}
          aria-busy={isPending}
          aria-label="Formulir status klaim supplier"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Status Klaim Supplier</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierClaimTransitionTo">Langkah Berikutnya</Label>
              <FormSelect
                id="supplierClaimTransitionTo"
                aria-label="Langkah klaim supplier berikutnya"
                value={transitionTo}
                onValueChange={setTransitionTo}
                options={visibleTargets}
                placeholder="Pilih langkah berikutnya"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierClaimRefNoTransition">
                {transitionTo === "sent"
                  ? "Nomor Referensi Klaim Supplier / Nomor Resi Pengiriman"
                  : transitionTo === "accepted"
                    ? "Nomor Referensi Persetujuan Vendor"
                    : "Nomor Referensi Klaim Supplier / Nomor Resi Pengiriman"}
              </Label>
              <Input
                id="supplierClaimRefNoTransition"
                name="supplierClaimRefNo"
                placeholder={
                  transitionTo === "accepted"
                    ? "Nomor referensi persetujuan vendor (bukan nomor resi pengiriman)"
                    : "Nomor klaim supplier atau nomor resi pengiriman"
                }
              />
              {transitionTo === "accepted" && (
                <p className="text-xs text-muted-foreground">
                  Nomor resi pengiriman bukan referensi persetujuan vendor. Recovery dijurnal hanya sesudah
                  nomor referensi persetujuan vendor terisi dan lampiran persetujuan sesudah pengiriman
                  terunggah.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="supplierClaimNotesTransition">Catatan / Alasan</Label>
              <Textarea
                id="supplierClaimNotesTransition"
                name="supplierClaimNotes"
                rows={3}
                placeholder="Bukti respons supplier, alasan penolakan, atau catatan disposisi"
              />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="submit" isDisabled={isPending || !transitionTo}>
              {isPending ? "Menyimpan..." : "Simpan Status Klaim Supplier"}
            </Button>
            {(transitionTo === "none" || transitionTo === "closed_no_recovery") && (
              <Button
                type="button"
                variant="danger"
                isDisabled={isPending}
                onClick={(e) => {
                  const form = e.currentTarget.form
                  setConfirmData(form ? new FormData(form) : new FormData())
                  setConfirmTo(transitionTo)
                }}
              >
                {transitionTo === "none" ? "Lepas Tautan…" : "Tutup Tanpa Recovery…"}
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Tombol berbingkai merah menjalankan langkah yang sama dengan konfirmasi dulu; alasan pada
            catatan di atas wajib terisi untuk langkah tersebut.
          </p>
        </form>
      )}

      <ConfirmDialog
        isOpen={confirmTo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmTo(null)
            setConfirmData(null)
          }
        }}
        title={confirmTarget?.label ?? "Konfirmasi"}
        body={
          confirmTo === "none"
            ? "Tautan klaim supplier dilepas dari klaim garansi ini. Retur pembelian draft yang tertaut tidak ikut terhapus."
            : "Klaim supplier ditutup tanpa recovery. Status ini final dan tidak bisa dilanjutkan lagi."
        }
        confirmLabel={confirmTarget?.label ?? "Konfirmasi"}
        variant="danger"
        isPending={isPending}
        onConfirm={runConfirmedTransition}
      />
    </div>
  )
}
