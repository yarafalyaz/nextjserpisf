"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  allocateCustomerCredit,
  refundCustomerCredit,
} from "@/actions/sales.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

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
}

/**
 * AUD-R4-01: panel operasional kredit pelanggan — memanggil
 * allocateCustomerCredit + refundCustomerCredit (rujukan nyata aksi→UI,
 * bukan allowlist). Alokasi/refund butuh faktur tujuan + nominal; service
 * menolak over-saldo/sisa/beda-pelanggan/bedaperiode di dalam transaksi.
 */
export function CustomerCreditPanel({ credits, invoices }: CustomerCreditPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [invoiceId, setInvoiceId] = useState<string>(invoices[0] ? String(invoices[0].id) : "")
  const [amount, setAmount] = useState<string>("")
  const [mode, setMode] = useState<"allocate" | "refund">("allocate")

  function run(creditId: number) {
    const nominal = Number(amount)
    if (!(nominal > 0)) {
      showError("Nominal harus lebih dari 0")
      return
    }
    startTransition(async () => {
      try {
        const result =
          mode === "allocate"
            ? await allocateCustomerCredit(creditId, Number(invoiceId), nominal)
            : await refundCustomerCredit(creditId, nominal)
        if (result && !result.success) {
          showError(result.error || "Gagal memproses kredit")
          return
        }
        showSuccess(mode === "allocate" ? "Kredit berhasil dialokasikan" : "Kredit berhasil di-refund")
        setAmount("")
        router.refresh()
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses kredit")
      }
    })
  }

  if (credits.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {credits.map((c) => {
        const saldo = Number(c.receivedAmount) - Number(c.allocatedAmount) - Number(c.refundedAmount)
        return (
          <div key={c.id} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="text-sm font-medium">
              {c.documentNo} — sisa {saldo.toLocaleString("id-ID")} ({c.status})
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs">
                Mode
                <select
                  aria-label="Mode kredit"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "allocate" | "refund")}
                  className="rounded border px-2 py-1"
                >
                  <option value="allocate">Alokasi ke faktur</option>
                  <option value="refund">Refund ke kas</option>
                </select>
              </label>
              {mode === "allocate" && (
                <label className="flex flex-col gap-1 text-xs">
                  Faktur tujuan
                  <select
                    aria-label="Faktur tujuan"
                    value={invoiceId}
                    onChange={(e) => setInvoiceId(e.target.value)}
                    className="rounded border px-2 py-1"
                  >
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.documentNo} (sisa {(Number(inv.grandTotal) - Number(inv.paidAmount)).toLocaleString("id-ID")})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-xs">
                Nominal (Rp)
                <input
                  aria-label="Nominal kredit"
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-40 rounded border px-2 py-1"
                />
              </label>
              <Button
                type="button"
                variant="primary"
                isDisabled={isPending || saldo <= 0}
                isPending={isPending}
                onPress={() => run(c.id)}
                aria-label={`Proses kredit ${c.documentNo}`}
              >
                {isPending ? "Memproses..." : mode === "allocate" ? "Alokasikan" : "Refund"}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
