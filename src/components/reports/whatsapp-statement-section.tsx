import type {
  CustomerStatementReport,
  CustomerStatementWhatsappTrailEntry,
} from "@/lib/reports/customer-statement-data"
import { formatDate } from "@/lib/utils/format"
import { buildStatementWhatsappMessage, buildWhatsappUrl } from "@/lib/utils/whatsapp"
import { WhatsappButton } from "./whatsapp-button"

/**
 * F-2026-10-25-038-F1 — permukaan WhatsApp di kepala kartu Statement
 * Pelanggan + riwayat jejak baca-saja (AC-SW-F1..F4).
 *
 * Pesan dibangun dari payload server saja (nama + periodLabel +
 * closingBalance lewat `buildStatementWhatsappMessage`, BR-SW-05): komponen
 * ini tidak menghitung ulang saldo apa pun. Bila pelanggan tidak terpilih
 * atau nomor tidak menghasilkan URL wa.me, seluruh permukaan TIDAK tampil —
 * tombol bukan elemen dinonaktifkan dan riwayat tidak dirender setengah
 * (AC-SW-F1). Label jujur: yang tercatat hanya "Tautan WhatsApp dibuka";
 * tidak ada klaim terkirim/dibaca di tombol maupun riwayat (BR-SW-01,
 * AC-SW-F3). Jejak dari loader Backend apa adanya, terbaru-dulu (AC-SW-F4).
 */
export function WhatsappStatementSection({
  customer,
  customerPhone,
  closingBalance,
  periodLabel,
  periodStart,
  periodEnd,
  whatsappTrail,
}: Readonly<{
  customer: CustomerStatementReport["customer"]
  customerPhone: string | null
  closingBalance: number
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  whatsappTrail: CustomerStatementWhatsappTrailEntry[]
}>) {
  if (!customer) return null

  const message = buildStatementWhatsappMessage({
    customerName: customer.name,
    periodLabel,
    closingBalance,
  })
  if (!buildWhatsappUrl(customerPhone, message)) return null

  return (
    <div className="print:hidden flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <WhatsappButton
          phone={customerPhone}
          message={message}
          modelType="CustomerStatement"
          modelId={customer.id}
          surface="detail"
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
        <p className="text-xs text-muted-foreground">Tautan WhatsApp dibuka tercatat sebagai jejak.</p>
      </div>
      {whatsappTrail.length > 0 ? (
        <ul aria-label="Riwayat tautan WhatsApp dibuka" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {whatsappTrail.map((entry, index) => (
            <li key={`${entry.createdAt.toISOString()}-${index}`}>
              Tautan WhatsApp dibuka — {formatDate(entry.createdAt, { includeTime: true })} WIB oleh{" "}
              {entry.userName ?? "Pengguna"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
