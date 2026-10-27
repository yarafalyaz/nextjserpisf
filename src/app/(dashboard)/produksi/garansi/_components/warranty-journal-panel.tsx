"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  postWarrantyClaimCostAction,
  postWarrantySupplierRecoveryAction,
} from "@/actions/warranty.actions"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/shadcn/label"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  canPostWarrantyClaimCost,
  canPostWarrantySupplierRecovery,
  type WarrantyJournalRoute,
} from "./warranty-journal-route-status"

export interface WarrantyJournalFacts {
  claimId: number
  status: string
  supplierClaimStatus: string
  decisionRecorded: boolean
  repairWorkOrderId: number | null
  claimCost: WarrantyJournalRoute
  supplierRecovery: WarrantyJournalRoute
}

type JournalActionResult =
  | { success: true; journalId: number; journalNumber: string; amount: number }
  | { success: false; error: string }
  | undefined

function formatJournalAmount(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount)
}

function RouteStatus({ route, label }: { route: WarrantyJournalRoute; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="text-[0.9375rem] text-foreground font-medium">
        {route.posted ? (
          <span>
            SUDAH DIPOSTING — Jurnal {route.journalNumber ?? "-"}
            {route.transactionDate ? ` · ${route.transactionDate}` : ""}
            {route.amountLabel ? ` · ${route.amountLabel}` : ""}
          </span>
        ) : (
          <span>BELUM DIPOSTING</span>
        )}
      </dd>
      {route.reversed && (
        <dd className="text-sm text-muted-foreground">
          Jurnal {route.reversed.journalNumber ?? "-"} ({route.reversed.transactionDate}) dibalik — lihat
          jurnal lawan
          {route.reversal
            ? ` ${route.reversal.journalNumber ?? "-"} (${route.reversal.transactionDate})`
            : ""}
          .
        </dd>
      )}
    </div>
  )
}

/**
 * Panel jurnal garansi tahap 3 rute provisi MATI (E2 biaya klaim + E3
 * recovery supplier) di detail klaim existing.
 *
 * Banner mode persis spec: tidak ada saldo provisi / tarif / estimasi
 * yang tampil di sini — angka sah hanya nominal jurnal POSTED nyata dari
 * server. E2 tanpa field nominal (server menghitung biaya WO repair);
 * E3 hanya amount + tanggal peristiwa. Kedua posting hanya dirender
 * bagi pemegang approve_warranty_claims (`canPost`); galat server
 * ditampilkan verbatim, penolakan anti-dobel yang memuat nomor jurnal
 * existing tampil sebagai info sukses (spec §7.5).
 */
export function WarrantyJournalPanel({
  facts,
  canPost,
}: {
  facts: WarrantyJournalFacts
  canPost: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [costEventDate, setCostEventDate] = useState("")
  const [recoveryEventDate, setRecoveryEventDate] = useState("")

  const showCostForm =
    canPost && !facts.claimCost.posted && canPostWarrantyClaimCost(facts)
  const showRecoveryForm =
    canPost &&
    !facts.supplierRecovery.posted &&
    canPostWarrantySupplierRecovery(facts)
  const showContingencyNote = !["accepted", "closed_recovered"].includes(
    facts.supplierClaimStatus,
  )

  function runJournal(
    action: (fd: FormData) => Promise<JournalActionResult>,
    formData: FormData,
    alreadyPostedNumber: string | null,
  ) {
    // Hasil sukses menampilkan journalNumber+amount server apa adanya;
    // penolakan anti-dobel yang memuat nomor jurnal existing -> info,
    // bukan error (spec §7.5); galat lain verbatim server.
    startTransition(async () => {
      try {
        const res = await action(formData)
        if (res?.success) {
          const text = `Jurnal ${res.journalNumber} — ${formatJournalAmount(res.amount)}`
          setLastResult(text)
          showSuccess(text)
          router.refresh()
          return
        }
        const error = res?.error ?? "Gagal memposting jurnal garansi"
        if (alreadyPostedNumber && error.includes(alreadyPostedNumber)) {
          const text = `Sudah diposting (jurnal ${alreadyPostedNumber})`
          setLastResult(text)
          showSuccess(text)
          router.refresh()
          return
        }
        showError(error)
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal memposting jurnal garansi")
      }
    })
  }

  function handleCost(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("claimId", String(facts.claimId))
    if (costEventDate) formData.set("eventDate", costEventDate)
    else formData.delete("eventDate")
    runJournal(
      postWarrantyClaimCostAction as (fd: FormData) => Promise<JournalActionResult>,
      formData,
      facts.claimCost.journalNumber,
    )
  }

  function handleRecovery(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("claimId", String(facts.claimId))
    if (recoveryEventDate) formData.set("eventDate", recoveryEventDate)
    else formData.delete("eventDate")
    const amountRaw = String(formData.get("amount") ?? "")
    if (!amountRaw || Number(amountRaw) <= 0) {
      showError("Nominal recovery harus lebih dari nol.")
      return
    }
    runJournal(
      postWarrantySupplierRecoveryAction as (fd: FormData) => Promise<JournalActionResult>,
      formData,
      facts.supplierRecovery.journalNumber,
    )
  }

  return (
    <section
      aria-label="Jurnal biaya klaim dan recovery supplier"
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
      <h2 className="text-[0.9375rem] font-semibold text-foreground">
        Jurnal Garansi — Biaya Klaim &amp; Recovery Supplier
      </h2>
      <p className="mt-2 rounded-lg bg-surface-secondary px-3 py-2 text-sm text-foreground">
        Mode provisi: MATI — biaya klaim dibebankan saat terjadi (510104), tanpa akrual provisi.
      </p>

      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RouteStatus route={facts.claimCost} label="Rute E2 — Biaya Klaim" />
        <RouteStatus route={facts.supplierRecovery} label="Rute E3 — Recovery Supplier" />
      </dl>

      {lastResult && (
        <p aria-live="polite" className="mt-4 text-sm font-medium text-foreground">
          {lastResult}
        </p>
      )}

      {showContingencyNote && (
        <p className="mt-4 text-sm text-muted-foreground">
          Recovery belum hampir pasti — tanpa jurnal (aset kontinjensi, PSAK 57).
        </p>
      )}

      {showCostForm && (
        <form
          onSubmit={handleCost}
          aria-busy={isPending}
          aria-label="Formulir posting jurnal biaya klaim"
          className="mt-6 flex flex-col gap-4 border-t border-default pt-5"
        >
          <h3 className="text-sm font-semibold text-foreground">Posting Jurnal Biaya Klaim (E2)</h3>
          <p className="text-sm text-muted-foreground">
            Nominal dihitung server dari WO repair tertaut — tidak ada isian nominal di sini. Bila
            biaya belum dapat ditampilkan, posting untuk memverifikasi.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warrantyCostEventDate">Tanggal Peristiwa (opsional)</Label>
              <AppDatePicker
                name="eventDate"
                value={costEventDate}
                onChange={setCostEventDate}
              />
            </div>
            <Button
              type="submit"
              aria-label="Posting jurnal biaya klaim"
              isDisabled={isPending}
            >
              {isPending ? "Memposting..." : "Posting Jurnal Biaya Klaim"}
            </Button>
          </div>
        </form>
      )}

      {showRecoveryForm && (
        <form
          onSubmit={handleRecovery}
          aria-busy={isPending}
          aria-label="Formulir posting jurnal recovery supplier"
          className="mt-6 flex flex-col gap-4 border-t border-default pt-5"
        >
          <h3 className="text-sm font-semibold text-foreground">Posting Jurnal Recovery Supplier (E3)</h3>
          <p className="text-sm text-muted-foreground">
            Nominal recovery tidak melebihi biaya klaim terverifikasi; server menolak bila
            melebihi, tanpa lampiran bukti, atau mapping akun kosong. Nomor referensi persetujuan
            vendor wajib terisi dan bukan nomor resi pengiriman; lampiran persetujuan sesudah
            pengiriman wajib terunggah.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warrantyRecoveryAmount">
                Nominal Recovery <span aria-hidden="true">*</span>
              </Label>
              <CurrencyInput
                id="warrantyRecoveryAmount"
                name="amount"
                aria-label="Nominal recovery supplier"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warrantyRecoveryEventDate">Tanggal Peristiwa (opsional)</Label>
              <AppDatePicker
                name="eventDate"
                value={recoveryEventDate}
                onChange={setRecoveryEventDate}
              />
            </div>
          </div>
          <div>
            <Button
              type="submit"
              aria-label="Posting jurnal recovery supplier"
              isDisabled={isPending}
            >
              {isPending ? "Memposting..." : "Posting Jurnal Recovery Supplier"}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
