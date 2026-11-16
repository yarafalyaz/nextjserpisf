"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import {
  allocateCustomerCredit,
  refundCustomerCredit,
} from "@/actions/sales.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { statusLabel } from "@/lib/utils/status-labels"

// Decimal Prisma diterima apa adanya (Number() di dalam) — hindari konversi
// presisi di server hanya demi tipe props.
interface CreditRow {
  id: number
  documentNo: string
  receivedAmount: unknown
  allocatedAmount: unknown
  refundedAmount: unknown
  status: string
}

interface CustomerCreditPanelProps {
  credits: CreditRow[]
  invoices: { id: number; documentNo: string; grandTotal: unknown; paidAmount: unknown }[]
  /** Izin confirm_down_payments dari server — gerbang elemen aksi; riwayat tetap terbaca. */
  canConfirm: boolean
}

/**
 * AUD-R4-01: panel operasional kredit pelanggan — memanggil
 * allocateCustomerCredit + refundCustomerCredit (rujukan nyata aksi→UI,
 * bukan allowlist). Alokasi/refund butuh faktur tujuan + nominal; service
 * menolak over-saldo/sisa/beda-pelanggan/bedaperiode di dalam transaksi.
 */
// AUD-R6-01: generator key di luar render (lint purity) — crypto murni,
// tanpa Date.now/Math.random.
function newOperationKey(): string {
  return crypto.randomUUID()
}

function CreditRowCard({
  credit,
  invoices,
  canConfirm,
}: {
  credit: CreditRow
  invoices: CustomerCreditPanelProps["invoices"]
  canConfirm: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [invoiceId, setInvoiceId] = useState<string>(invoices[0] ? String(invoices[0].id) : "")
  const [amount, setAmount] = useState<string>("")
  const [mode, setMode] = useState<"allocate" | "refund">("allocate")
  // AUD-R7-04: key stabil per intent + TAHAN REFRESH. useRef untuk sesi
  // komponen; sessionStorage untuk retry lintas reload (timeout lalu refresh
  // sebelum respons tiba). Kunci: key dihapus HANYA saat hasil definitif —
  // refresh di tengah intent pending = key sama = retry aman, bukan operasi baru.
  const keyRef = useRef<string | null>(null)
  const intentRef = useRef<string>("")

  function intentKeyName(intent: string): string {
    return `cc-idem:${intent}`
  }
  const storageOK = useRef<boolean | null>(null)
  function storageAvailable(): boolean {
    if (storageOK.current !== null) return storageOK.current
    let ok = false
    try {
      const probe = "__cc_probe"
      sessionStorage.setItem(probe, "1")
      sessionStorage.removeItem(probe)
      ok = true
    } catch {
      console.warn("[customer-credit] sessionStorage tak tersedia - retry lintas refresh nonaktif")
      showError("Penyimpanan sesi browser diblokir - ulangi dari halaman ini bila timeout (jangan refresh)")
    }
    storageOK.current = ok
    return ok
  }
  function storageFail(op: string): void {
    console.warn(`[customer-credit] sessionStorage ${op} gagal - key intent hanya sesi-komponen`)
    showError("Penyimpanan sesi browser gagal - jangan refresh; klik lagi untuk retry aman")
  }
  function loadIntentKey(intent: string): string | null {
    if (keyRef.current !== null && intentRef.current === intent) return keyRef.current
    if (!storageAvailable()) return null
    try {
      return sessionStorage.getItem(intentKeyName(intent))
    } catch {
      storageFail("baca")
      return keyRef.current
    }
  }
  function saveIntentKey(intent: string, key: string): void {
    keyRef.current = key
    intentRef.current = intent
    if (!storageAvailable()) return
    try {
      sessionStorage.setItem(intentKeyName(intent), key)
    } catch {
      storageFail("tulis")
    }
  }
  function clearIntentKey(intent: string): void {
    keyRef.current = null
    if (!storageAvailable()) return
    try {
      sessionStorage.removeItem(intentKeyName(intent))
    } catch {
      storageFail("hapus")
    }
  }

  function run() {
    if (mode === "allocate" && invoices.length === 0) {
      showError("Tidak ada faktur terbuka untuk dialokasikan")
      return
    }
    const nominal = Number(amount)
    if (!(nominal > 0)) {
      showError("Nominal harus lebih dari 0")
      return
    }
    const intent = `${mode}:${credit.id}:${mode === "allocate" ? invoiceId : "-"}:${nominal}`
    let key = loadIntentKey(intent)
    if (key === null) {
      key = newOperationKey()
      saveIntentKey(intent, key)
    }
    startTransition(async () => {
      try {
        const result =
          mode === "allocate"
            ? await allocateCustomerCredit(credit.id, Number(invoiceId), nominal, key)
            : await refundCustomerCredit(credit.id, nominal, key)
        if (result && !result.success) {
          if (!("ambiguous" in result && result.ambiguous === true)) {
            clearIntentKey(intent)
            showError(result.error || "Gagal memproses kredit")
          } else {
            showError(`${result.error || "Hasil belum pasti"} - JANGAN buat intent baru; klik lagi untuk retry aman`)
          }
          return
        }
        clearIntentKey(intent)
        if (result && "warning" in result && typeof result.warning === "string") {
          showError(result.warning)
        } else if (result && "replayed" in result && result.replayed === true) {
          const ref = ("paymentId" in result && result.paymentId) || ("journalId" in result && result.journalId) || "?"
          showSuccess(`Sudah diproses sebelumnya (ref #${ref}) - tidak ada mutasi baru`)
        } else {
          showSuccess(mode === "allocate" ? "Kredit berhasil dialokasikan" : "Kredit berhasil di-refund")
        }
        setAmount("")
        router.refresh()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses kredit")
      }
    })
  }

  const saldo = Number(credit.receivedAmount) - Number(credit.allocatedAmount) - Number(credit.refundedAmount)
  const noOpenInvoices = mode === "allocate" && invoices.length === 0

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-2xs">
      <div className="text-sm font-medium text-foreground">
        <span className="font-mono tabular-nums">{credit.documentNo}</span> - sisa{" "}
        <span className="font-mono tabular-nums font-semibold">{saldo.toLocaleString("id-ID")}</span>{" "}
        <span className="text-muted-foreground">({statusLabel(credit.status)})</span>
      </div>
      {canConfirm && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            Mode
            <select
              aria-label="Mode kredit"
              value={mode}
              onChange={(e) => setMode(e.target.value as "allocate" | "refund")}
              className="min-h-11 sm:min-h-9 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="allocate">Alokasi ke faktur</option>
              <option value="refund">Refund ke kas</option>
            </select>
          </label>
          {mode === "allocate" && (
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Faktur tujuan
              <select
                aria-label="Faktur tujuan"
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                disabled={invoices.length === 0}
                className="min-h-11 sm:min-h-9 rounded-md border border-input bg-card px-2.5 py-1 text-xs text-foreground cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {invoices.length === 0 ? (
                  <option value="">Tidak ada faktur terbuka</option>
                ) : (
                  invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.documentNo} (sisa {(Number(inv.grandTotal) - Number(inv.paidAmount)).toLocaleString("id-ID")})
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            Nominal (Rp)
            <Input
              aria-label="Nominal kredit"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-40 min-h-11 sm:min-h-9 font-mono tabular-nums text-xs"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            isDisabled={isPending || saldo <= 0 || noOpenInvoices}
            isPending={isPending}
            onPress={run}
            aria-label={`Proses kredit ${credit.documentNo}`}
            className="min-h-11 sm:min-h-9"
          >
            {isPending ? "Memproses..." : mode === "allocate" ? "Alokasikan" : "Refund"}
          </Button>
        </div>
      )}
    </div>
  )
}

export function CustomerCreditPanel({ credits, invoices, canConfirm }: CustomerCreditPanelProps) {
  if (credits.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {credits.map((c) => (
        <CreditRowCard key={c.id} credit={c} invoices={invoices} canConfirm={canConfirm} />
      ))}
    </div>
  )
}
