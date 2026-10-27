"use client"

import { useState } from "react"

import { decideWarrantyClaimAction, transitionWarrantyClaimAction } from "@/actions/warranty.actions"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { useWarrantyAction } from "./warranty-submit"

export interface WarrantyClaimFacts {
  id: number
  status: string
  complaint: string
  reportedAt: string
  odometerKm: number | null
  coverageId: number
  coverageStatus: string
  coverageTermsSnapshot: string
  serialLabel: string
  serialIsPlaceholder: boolean
  installedAt: string
  expiresAt: string
  warrantyMonths: number
  mileageLimitKm: number | null
  plateNumber: string | null
  eligibility: {
    coverageStatus: string
    withinPeriod: boolean
    withinMileage: boolean | null
    serialMatches: boolean | null
    notes: string[]
  }
  decisionByName: string | null
  decisionAt: string | null
  decisionNotes: string | null
  resolutionType: string | null
  repairWorkOrderId: number | null
}

/**
 * Panel aksi klaim garansi di halaman detail (F-021 tahap UI).
 *
 * `eligibility` dari service adalah FAKTA untuk penilai — ditampilkan apa
 * adanya di bawah judul "Fakta Penilaian", BUKAN keputusan: UI tidak
 * menyimpulkan layak/tidak, tidak memilihkan keputusan, dan tidak mengubah
 * status otomatis. Keputusan (setuju/tolak) dan transisi status selalu
 * klik eksplisit pejabat lewat action existing; galat service verbatim.
 * Tombol-gating menurut izin halaman: `canDecide` (approve_warranty_claims)
 * dan `canTransition` (edit_warranty_claims) terpisah.
 */
export function WarrantyClaimActions({
  claim,
  canDecide,
  canTransition,
}: {
  claim: WarrantyClaimFacts
  canDecide: boolean
  canTransition: boolean
}) {
  const { isPending, run } = useWarrantyAction()
  const [decision, setDecision] = useState("")
  const [resolutionType, setResolutionType] = useState("")

  const status = claim.status
  const showDecision = canDecide && status === "eligibility"
  const transitionTargets: { value: string; label: string }[] =
    status === "intake"
      ? [{ value: "eligibility", label: "Mulai Penilaian Fakta" }]
      : status === "approved"
        ? [
            { value: "in_repair", label: "Mulai Perbaikan" },
            { value: "closed", label: "Tutup Klaim" },
          ]
        : status === "rejected"
          ? [{ value: "closed", label: "Tutup Klaim" }]
          : status === "in_repair"
            ? [{ value: "closed", label: "Tutup Klaim" }]
            : []
  const showTransition = canTransition && transitionTargets.length > 0

  function handleDecision(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("claimId", String(claim.id))
    formData.set("decision", decision)
    formData.set("resolutionType", resolutionType)
    run(decideWarrantyClaimAction, formData, "Keputusan klaim garansi tercatat")
  }

  function handleTransition(to: string) {
    const formData = new FormData()
    formData.set("claimId", String(claim.id))
    formData.set("to", to)
    run(transitionWarrantyClaimAction, formData, "Status klaim garansi diperbarui")
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Fakta penilaian klaim garansi"
        className="bg-surface rounded-xl border border-default shadow-sm p-6"
      >
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Fakta Penilaian</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fakta berikut membantu penilai; bukan keputusan otomatis. Keputusan tetap diambil pejabat.
        </p>
        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Cakupan</dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">{claim.eligibility.coverageStatus}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dalam Masa Berlaku</dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">{claim.eligibility.withinPeriod ? "Ya" : "Tidak"}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dalam Batas Odometer</dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {claim.eligibility.withinMileage === null ? "Tidak tercatat" : claim.eligibility.withinMileage ? "Ya" : "Tidak"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nomor Seri</dt>
            <dd className="text-[0.9375rem] text-foreground font-medium">
              {claim.serialIsPlaceholder ? (
                <span>Belum ada nomor serial tercatat untuk cakupan ini</span>
              ) : (
                <span className="font-mono">{claim.serialLabel}</span>
              )}
            </dd>
          </div>
        </dl>
        {claim.eligibility.notes.length > 0 && (
          <div className="mt-4 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan Fakta</span>
            <ul className="list-disc pl-5 text-sm text-foreground">
              {claim.eligibility.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Syarat Garansi Saat Pemasangan (Snapshot)
          </span>
          <p className="whitespace-pre-wrap text-sm text-foreground">{claim.coverageTermsSnapshot}</p>
        </div>
      </section>

      {showDecision && (
        <form
          onSubmit={handleDecision}
          aria-busy={isPending}
          aria-label="Formulir keputusan klaim garansi"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Keputusan Pejabat</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="decision">Keputusan</Label>
              <FormSelect
                id="decision"
                aria-label="Keputusan klaim"
                value={decision}
                onValueChange={setDecision}
                options={[
                  { value: "approved", label: "Setujui" },
                  { value: "rejected", label: "Tolak" },
                ]}
                placeholder="Pilih keputusan"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolutionType">Jenis Penyelesaian</Label>
              <FormSelect
                id="resolutionType"
                aria-label="Jenis penyelesaian klaim"
                value={resolutionType}
                onValueChange={setResolutionType}
                options={[
                  { value: "repair", label: "Perbaikan" },
                  { value: "replace", label: "Penggantian" },
                  { value: "reject", label: "Penolakan" },
                ]}
                placeholder="Pilih jenis penyelesaian"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="decisionNotes">Catatan Keputusan (opsional)</Label>
              <Textarea
                id="decisionNotes"
                name="decisionNotes"
                rows={3}
                placeholder="Alasan atau catatan keputusan pejabat"
              />
            </div>
          </div>
          <div className="mt-6">
            <Button type="submit" isDisabled={isPending}>
              {isPending ? "Menyimpan..." : "Simpan Keputusan"}
            </Button>
          </div>
        </form>
      )}

      {claim.decisionAt && (
        <section
          aria-label="Catatan keputusan klaim garansi"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Keputusan Tercatat</h2>
          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Diputuskan</dt>
              <dd className="text-[0.9375rem] text-foreground font-medium">{claim.decisionAt}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jenis Penyelesaian</dt>
              <dd className="text-[0.9375rem] text-foreground font-medium">{claim.resolutionType ?? "-"}</dd>
            </div>
            {claim.decisionNotes && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Catatan Keputusan</dt>
                <dd className="whitespace-pre-wrap text-[0.9375rem] text-foreground">{claim.decisionNotes}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {showTransition && (
        <section
          aria-label="Aksi status klaim garansi"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Status Klaim</h2>
          <div className="mt-4 flex flex-col gap-4">
            {transitionTargets.map((t) => (
              <div key={t.value} className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  isDisabled={isPending}
                  onClick={() => {
                    if (t.value === "in_repair") {
                      const el = document.getElementById("warranty-repair-wo-form")
                      el?.scrollIntoView({ behavior: "smooth", block: "start" })
                      return
                    }
                    handleTransition(t.value)
                  }}
                >
                  {t.label}
                </Button>
                {t.value === "in_repair" && (
                  <span className="text-sm text-muted-foreground">
                    Isi nomor work order perbaikan pada formulir di bawah bila ada.
                  </span>
                )}
              </div>
            ))}
            {status === "approved" && (
              <form
                id="warranty-repair-wo-form"
                aria-label="Formulir mulai perbaikan klaim garansi"
                onSubmit={(e) => {
                  e.preventDefault()
                  const formData = new FormData(e.currentTarget)
                  formData.set("claimId", String(claim.id))
                  formData.set("to", "in_repair")
                  run(transitionWarrantyClaimAction, formData, "Klaim garansi mulai diperbaiki")
                }}
                className="flex flex-wrap items-end gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="repairWorkOrderId">ID Work Order Perbaikan (opsional)</Label>
                  <Input id="repairWorkOrderId" name="repairWorkOrderId" type="number" min={0} inputMode="numeric" />
                </div>
                <Button type="submit" variant="secondary" isDisabled={isPending}>
                  Mulai Perbaikan dengan Work Order
                </Button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
