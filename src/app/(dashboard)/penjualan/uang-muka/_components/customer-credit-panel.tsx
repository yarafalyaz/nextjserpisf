"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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

export function CustomerCreditPanel({ credits, invoices }: CustomerCreditPanelProps) {
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
  // sessionStorage = opsional progresif: bila tak tersedia, key sesi-komponen
  // (useRef) tetap melindungi retry selama komponen hidup. Satu probe di
  // awal menulis flag — tanpa try/catch berulang di tiap helper.
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
      // Storage diblokir/penuh: beri tahu pengguna SEKALI (pola yang sama
      // dengan export-buttons: console + showError = bukan senyap). Retry
      // sesi-komponen tetap jalan tanpa lintas-refresh.
      console.warn("[customer-credit] sessionStorage tak tersedia — retry lintas refresh nonaktif")
      showError("Penyimpanan sesi browser diblokir — ulangi dari halaman ini bila timeout (jangan refresh)")
    }
    storageOK.current = ok
    return ok
  }
  // AUD-R8-04: SETIAP operasi storage dilindungi sendiri (probe bisa basi:
  // kuota berubah/penuh antar probe dan tulis nyata). Kegagalan storage =
  // fallback key sesi-komponen + pesan konsisten — key finansial TAK PERNAH
  // diganti diam-diam; submit tetap pakai key sesi yang sama.
  function storageFail(op: string): void {
    console.warn(`[customer-credit] sessionStorage ${op} gagal — key intent hanya sesi-komponen`)
    showError("Penyimpanan sesi browser gagal — jangan refresh; klik lagi untuk retry aman")
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
      // Key sesi-komponen SUDAH tersimpan di atas — submit tetap pakai key
      // yang sama (bukan key baru). Hanya ketahanan lintas-refresh hilang.
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

  function run(creditId: number) {
    const nominal = Number(amount)
    if (!(nominal > 0)) {
      showError("Nominal harus lebih dari 0")
      return
    }
    const intent = `${mode}:${creditId}:${mode === "allocate" ? invoiceId : "-"}:${nominal}`
    let key = loadIntentKey(intent)
    if (key === null) {
      key = newOperationKey()
      saveIntentKey(intent, key)
    }
    startTransition(async () => {
      try {
        const result =
          mode === "allocate"
            ? await allocateCustomerCredit(creditId, Number(invoiceId), nominal, key)
            : await refundCustomerCredit(creditId, nominal, key)
        if (result && !result.success) {
          // AUD-R8-01: key dibuang HANYA bila gagal DEFINITIF (validasi
          // sebelum mutasi). Gagal AMBIGU (timeout/deadlock/commit tak pasti)
          // = key DIPERTAHANKAN — klik ulang = retry aman key sama, bukan
          // operasi baru. Rekonsiliasi: cek mutasi/saldo sebelum intent baru.
          if (!("ambiguous" in result && result.ambiguous === true)) {
            clearIntentKey(intent)
            showError(result.error || "Gagal memproses kredit")
          } else {
            showError(`${result.error || "Hasil belum pasti"} — JANGAN buat intent baru; klik lagi untuk retry aman`)
          }
          return
        }
        // Sukses (termasuk replay retry): intent selesai, key dibuang.
        clearIntentKey(intent)
        if (result && "warning" in result && typeof result.warning === "string") {
          showError(result.warning)
        } else if (result && "replayed" in result && result.replayed === true) {
          // AUD-R7-03: retry retry = hasil operasi PERTAMA (tanpa mutasi baru).
          const ref = ("paymentId" in result && result.paymentId) || ("journalId" in result && result.journalId) || "?";
          showSuccess(`Sudah diproses sebelumnya (ref #${ref}) — tidak ada mutasi baru`)
        } else {
          showSuccess(mode === "allocate" ? "Kredit berhasil dialokasikan" : "Kredit berhasil di-refund")
        }
        setAmount("")
        router.refresh()
      } catch (e) {
        // Error jaringan/timeout: key DIPERTAHANKAN — klik ulang = retry aman
        // dengan key sama, bukan operasi baru.
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
              {c.documentNo} — sisa {saldo.toLocaleString("id-ID")} ({statusLabel(c.status)})
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
