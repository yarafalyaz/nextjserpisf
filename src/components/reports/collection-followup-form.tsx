"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createInvoiceCollectionFollowUp } from "@/actions/invoice-collection.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  COLLECTION_CHANNELS,
  COLLECTION_OUTCOMES,
  type CollectionChannel,
  type CollectionOutcome,
} from "@/lib/reports/collection-queue"

const CHANNEL_LABELS: Record<CollectionChannel, string> = {
  telepon: "Telepon",
  whatsapp: "WhatsApp",
  kunjungan: "Kunjungan",
  email: "Email",
  lainnya: "Lainnya",
}

const OUTCOME_LABELS: Record<CollectionOutcome, string> = {
  terhubung_janji_bayar: "Terhubung — Janji Bayar",
  terhubung_tanpa_janji: "Terhubung — Tanpa Janji",
  tidak_terhubung: "Tidak Terhubung",
  sengketa: "Sengketa",
  lainnya: "Lainnya",
}

/**
 * Form singkat Catat Tindak Lanjut penagihan (F-2026-10-22-089-S §6).
 * Simpan eksplisit ke aksi append-only BOT 3 — klik WhatsApp bukan
 * tindak lanjut (BR-COL-08). Error server tampil verbatim.
 */
export function CollectionFollowUpForm({
  salesInvoiceId,
  documentNo,
}: Readonly<{ salesInvoiceId: number; documentNo: string }>) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [channel, setChannel] = useState("telepon")
  const [outcome, setOutcome] = useState("terhubung_janji_bayar")

  const isPromise = outcome === "terhubung_janji_bayar"

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await createInvoiceCollectionFollowUp(formData)
      if (!result.success) {
        showError(result.error ?? "Gagal mencatat tindak lanjut.")
        return
      }
      showSuccess("Tindak lanjut penagihan tercatat.")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          Catat Tindak Lanjut
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Catat Tindak Lanjut — {documentNo}</DialogTitle>
          <DialogDescription>
            Mencatat tindak lanjut tidak mencatat pembayaran dan tidak membuat jurnal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="salesInvoiceId" value={salesInvoiceId} />
          <AppDatePicker
              label="Tanggal Tindak Lanjut"
              name="followedUpAt"
              required
              defaultValue={new Date()}
            />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`channel-${salesInvoiceId}`}>Kanal</Label>
            <FormSelect
              id={`channel-${salesInvoiceId}`}
              name="channel"
              value={channel}
              onValueChange={setChannel}
              options={COLLECTION_CHANNELS.map((value) => ({
                value,
                label: CHANNEL_LABELS[value],
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`outcome-${salesInvoiceId}`}>Hasil</Label>
            <FormSelect
              id={`outcome-${salesInvoiceId}`}
              name="outcome"
              value={outcome}
              onValueChange={setOutcome}
              options={COLLECTION_OUTCOMES.map((value) => ({
                value,
                label: OUTCOME_LABELS[value],
              }))}
            />
          </div>
          {isPromise ? (
            <>
              <AppDatePicker label="Tanggal Janji Bayar" name="promisedDate" required />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`promised-amount-${salesInvoiceId}`}>
                  Nominal Janji Bayar (opsional)
                </Label>
                <Input
                  id={`promised-amount-${salesInvoiceId}`}
                  name="promisedAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0"
                />
              </div>
            </>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`notes-${salesInvoiceId}`}>Catatan (opsional)</Label>
            <Textarea
              id={`notes-${salesInvoiceId}`}
              name="notes"
              rows={3}
              maxLength={2000}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              isDisabled={isPending}
            >
              Batal
            </Button>
            <Button type="submit" isPending={isPending}>
              {isPending ? "Menyimpan…" : "Simpan Tindak Lanjut"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
