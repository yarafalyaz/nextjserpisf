import type {
  CustomerStatementReport,
  CustomerStatementEmailTrailEntry,
} from "@/lib/reports/customer-statement-data";
import { formatDate } from "@/lib/utils/format";
import { buildStatementEmailUrl } from "@/lib/utils/email-statement-message";
import { EmailButton } from "./email-button";

/**
 * F-2026-10-25-043-F1 — permukaan Email di kepala kartu Statement
 * Pelanggan + riwayat jejak baca-saja (AC-SE-F1..F4).
 *
 * Tautan mailto dibangun dari payload server saja (email + nama +
 * periodLabel + closingBalance lewat `buildStatementEmailUrl`,
 * BR-SE-05): komponen ini tidak menghitung ulang saldo apa pun. Bila
 * pelanggan tidak terpilih atau alamat tidak menghasilkan URL mailto,
 * seluruh permukaan TIDAK tampil — tombol bukan elemen dinonaktifkan
 * dan riwayat tidak dirender setengah (AC-SE-F1). Label jujur: yang
 * tercatat hanya "Tautan Email dibuka"; tidak ada klaim
 * terkirim/dibaca/sudah dihubungi di tombol maupun riwayat
 * (BR-SE-01/AC-SE-F3). Jejak dari loader Backend apa adanya,
 * terbaru-dulu, TERPISAH dari jejak WhatsApp (AC-SE-F4/BR-SE-10).
 */
export function EmailStatementSection({
  customer,
  customerEmail,
  closingBalance,
  periodLabel,
  periodStart,
  periodEnd,
  emailTrail,
}: Readonly<{
  customer: CustomerStatementReport["customer"];
  customerEmail: string | null;
  closingBalance: number;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  emailTrail: CustomerStatementEmailTrailEntry[];
}>) {
  if (!customer) return null;

  const href = buildStatementEmailUrl(customerEmail, {
    customerName: customer.name,
    periodLabel,
    closingBalance,
  });
  if (!href) return null;

  return (
    <div className="print:hidden flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <EmailButton
          href={href}
          modelId={customer.id}
          periodStart={periodStart}
          periodEnd={periodEnd}
        />
        <p className="text-xs text-muted-foreground">Tautan Email dibuka tercatat sebagai jejak.</p>
      </div>
      {emailTrail.length > 0 ? (
        <ul aria-label="Riwayat tautan Email dibuka" className="flex flex-col gap-1 text-sm text-muted-foreground">
          {emailTrail.map((entry, index) => (
            <li key={`${entry.createdAt.toISOString()}-${index}`}>
              Tautan Email dibuka — {formatDate(entry.createdAt, { includeTime: true })} WIB oleh{" "}
              {entry.userName ?? "Pengguna"}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
