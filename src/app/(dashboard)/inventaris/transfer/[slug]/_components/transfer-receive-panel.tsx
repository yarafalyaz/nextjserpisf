"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { closeInventoryTransferShortage, receiveInventoryTransfer } from "@/actions/inventory.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { formatNumber } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"

export interface TransferReceiveLine {
  transferItemId: number
  itemName: string
  unit: string
  qty: number
  receivedQty: number
  /** qty - receivedQty, dihitung server (remainingQty) — UI tidak hitung ulang. */
  remainingQty: number
  /** Serial terkirim yang masih belum diterima (server: remainingSerials). Kosong = bukan baris berserial. */
  remainingSerials: string[]
  /** Lot terkirim (sumber) yang bisa dialokasikan kali ini. Kosong = bukan baris batch-tracked. */
  batchAllocations: { batchNumber: string; qty: number }[]
}

interface TransferReceivePanelProps {
  transferId: number
  status: string
  lines: TransferReceiveLine[]
  canCloseShortage: boolean
}

/** Peringatan verbatim SPEC F-2026-10-22-081-S §6 untuk form tutup selisih. */
export const TRANSFER_SHORTAGE_WARNING =
  "Sisa akan dihapus dari persediaan lewat Penyesuaian Stok sesudah disetujui. Barang yang ternyata tiba sesudah ditutup tidak bisa diterima dari transfer ini."

// Idempotency per kejadian (BR-TP-06): satu key stabil per intent terima;
// retry/error memakai key sama, sukses mengganti key baru.
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function TransferReceivePanel({ transferId, status, lines, canCloseShortage }: TransferReceivePanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())
  const [receivedDate, setReceivedDate] = useState("")
  const [qtyByLine, setQtyByLine] = useState<Record<number, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.transferItemId, String(l.remainingQty)])),
  )
  const [serialsByLine, setSerialsByLine] = useState<Record<number, string[]>>({})
  const [batchQtyByLine, setBatchQtyByLine] = useState<Record<number, Record<string, string>>>({})
  const [closeOpen, setCloseOpen] = useState(false)

  const receiveLabel = status === "partially_received" ? "Terima Susulan" : "Terima Barang"

  function toggleSerial(lineId: number, serial: string, checked: boolean) {
    const nextSerials = checked
      ? [...(serialsByLine[lineId] ?? []), serial]
      : (serialsByLine[lineId] ?? []).filter((s) => s !== serial)
    setSerialsByLine((prev) => ({ ...prev, [lineId]: nextSerials }))
    // Item berserial: qty kali ini mengikuti jumlah serial terpilih (server
    // menuntut tepat qty serial — BR-TP-08), supaya pengguna tak menebak.
    setQtyByLine((prev) => ({ ...prev, [lineId]: String(nextSerials.length) }))
  }

  function handleReceive(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = lines
      .map((line) => {
        const qty = Number(String(qtyByLine[line.transferItemId] ?? "").replace(",", "."))
        const serialNumbers = serialsByLine[line.transferItemId] ?? []
        const batchAllocations = Object.entries(batchQtyByLine[line.transferItemId] ?? {})
          .map(([batchNumber, raw]) => ({ batchNumber, qty: Number(String(raw).replace(",", ".")) }))
          .filter((b) => b.qty > 0)
        return {
          transferItemId: line.transferItemId,
          qty,
          ...(serialNumbers.length > 0 ? { serialNumbers } : {}),
          ...(batchAllocations.length > 0 ? { batchAllocations } : {}),
        }
      })
      .filter((line) => Number.isFinite(line.qty) && line.qty > 0)

    if (payload.length === 0) {
      showError("Isi jumlah diterima kali ini untuk minimal satu baris.")
      return
    }

    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("items", JSON.stringify(payload))
        formData.set("idempotencyKey", idempotencyKeyRef.current)
        if (receivedDate) formData.set("receivedDate", receivedDate)
        const result = await receiveInventoryTransfer(transferId, formData)
        if (result && result.success === false) {
          showError(result.error || "Gagal menerima transfer")
          return
        }
        idempotencyKeyRef.current = newIdempotencyKey()
        showSuccess(status === "partially_received" ? "Penerimaan susulan berhasil dicatat" : "Transfer stok berhasil diterima")
        router.refresh()
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e
        }
        showError(e instanceof Error ? e.message : "Gagal menerima transfer")
      }
    })
  }

  function handleCloseShortage() {
    startTransition(async () => {
      try {
        const result = await closeInventoryTransferShortage(transferId)
        if (result && result.success === false) {
          showError(result.error || "Gagal membuat draf penutupan selisih")
          setCloseOpen(false)
          return
        }
        showSuccess("Draf penutupan selisih berhasil dibuat")
        setCloseOpen(false)
        router.refresh()
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e
        }
        showError(e instanceof Error ? e.message : "Gagal membuat draf penutupan selisih")
        setCloseOpen(false)
      }
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">Penerimaan</h2>
      </div>
      <form onSubmit={handleReceive} aria-label="Formulir terima barang transfer" aria-busy={isPending} className="flex flex-col gap-4 p-4 px-5">
        <div className="max-w-xs">
          <AppDatePicker
            label="Tanggal Terima"
            name="receivedDate"
            value={receivedDate}
            onChange={setReceivedDate}
            disabled={isPending}
          />
        </div>
        <div className="overflow-x-auto">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Nama Barang</DetailTableTh>
              <DetailTableTh align="right">Terkirim</DetailTableTh>
              <DetailTableTh align="right">Sudah Diterima</DetailTableTh>
              <DetailTableTh align="right">Belum Diterima</DetailTableTh>
              <DetailTableTh align="right">Diterima Kali Ini</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {lines.map((line) => {
                const qtyId = `received-qty-${line.transferItemId}`
                const selectedSerials = serialsByLine[line.transferItemId] ?? []
                return (
                  <DetailTableRow key={line.transferItemId}>
                    <DetailTableTd>
                      <div className="flex flex-col gap-2">
                        <span>{line.itemName}</span>
                        {line.remainingSerials.length > 0 && (
                          <fieldset>
                            <legend className="text-xs text-muted-foreground">Pilih serial yang tiba</legend>
                            <div className="mt-1 flex flex-col gap-1">
                              {line.remainingSerials.map((serial) => {
                                const serialId = `serial-${line.transferItemId}-${serial}`
                                return (
                                  <div key={serial} className="flex min-h-11 items-center gap-2">
                                    <Checkbox
                                      id={serialId}
                                      checked={selectedSerials.includes(serial)}
                                      disabled={isPending}
                                      onCheckedChange={(checked) => toggleSerial(line.transferItemId, serial, checked === true)}
                                    />
                                    <Label htmlFor={serialId} className="font-mono text-xs">{serial}</Label>
                                  </div>
                                )
                              })}
                            </div>
                          </fieldset>
                        )}
                        {line.batchAllocations.length > 0 && (
                          <fieldset>
                            <legend className="text-xs text-muted-foreground">Alokasi lot yang tiba (wajib untuk barang berlot)</legend>
                            <div className="mt-1 flex flex-col gap-2">
                              {line.batchAllocations.map((batch) => {
                                const batchId = `batch-${line.transferItemId}-${batch.batchNumber}`
                                return (
                                  <div key={batch.batchNumber} className="flex min-h-11 flex-wrap items-center gap-2">
                                    <Label htmlFor={batchId} className="font-mono text-xs">
                                      Lot {batch.batchNumber} (terkirim {formatNumber(batch.qty)})
                                    </Label>
                                    <Input
                                      id={batchId}
                                      inputMode="decimal"
                                      className="w-28"
                                      disabled={isPending}
                                      value={batchQtyByLine[line.transferItemId]?.[batch.batchNumber] ?? ""}
                                      onChange={(e) =>
                                        setBatchQtyByLine((prev) => ({
                                          ...prev,
                                          [line.transferItemId]: { ...(prev[line.transferItemId] ?? {}), [batch.batchNumber]: e.target.value },
                                        }))
                                      }
                                    />
                                  </div>
                                )
                              })}
                            </div>
                          </fieldset>
                        )}
                      </div>
                    </DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.qty)} {line.unit}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.receivedQty)}</DetailTableTd>
                    <DetailTableTd align="right">{formatNumber(line.remainingQty)}</DetailTableTd>
                    <DetailTableTd align="right">
                      <Label htmlFor={qtyId} className="sr-only">Diterima kali ini untuk {line.itemName}</Label>
                      <Input
                        id={qtyId}
                        inputMode="decimal"
                        className="ml-auto w-28 text-right"
                        disabled={isPending}
                        aria-describedby={line.remainingSerials.length > 0 ? `${qtyId}-serial-hint` : undefined}
                        value={qtyByLine[line.transferItemId] ?? ""}
                        onChange={(e) => setQtyByLine((prev) => ({ ...prev, [line.transferItemId]: e.target.value }))}
                      />
                      {line.remainingSerials.length > 0 && (
                        <p id={`${qtyId}-serial-hint`} className="mt-1 text-xs text-muted-foreground">
                          Jumlah mengikuti serial terpilih.
                        </p>
                      )}
                    </DetailTableTd>
                  </DetailTableRow>
                )
              })}
            </DetailTableBody>
          </DetailTable>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={isPending} aria-busy={isPending || undefined}>
            {receiveLabel}
          </Button>
          {canCloseShortage && (
            <Button type="button" variant="secondary" isDisabled={isPending} onPress={() => setCloseOpen(true)}>
              Tutup Selisih
            </Button>
          )}
        </div>
      </form>
      <ConfirmDialog
        isOpen={closeOpen}
        onOpenChange={setCloseOpen}
        title="Tutup selisih transfer ini?"
        body={TRANSFER_SHORTAGE_WARNING}
        confirmLabel="Tutup Selisih"
        variant="warning"
        isPending={isPending}
        onConfirm={handleCloseShortage}
      />
    </div>
  )
}
