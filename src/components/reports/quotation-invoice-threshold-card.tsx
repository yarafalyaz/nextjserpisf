import type { InvoiceThresholdInfo } from "@/lib/sales/invoice-threshold";

/**
 * F-2026-10-22-065-S (UI, AC-DP65-6/7): persen ambang invoice efektif +
 * label sumber verbatim dari server (`buildInvoiceThresholdInfo`).
 * Komponen murni presentasi: TIDAK menghitung ambang sendiri; nilai
 * `info` ditampilkan apa adanya persis dari builder server.
 */
export function QuotationInvoiceThresholdCard({
  info,
}: Readonly<{ info: InvoiceThresholdInfo }>) {
  return (
    <section
      aria-label="Ambang Invoice Penawaran"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Ambang Invoice
        </h2>
        <p className="text-xs text-muted-foreground">{info.percent}%</p>
      </div>
      <div className="p-4 px-5">
        <p className="text-sm text-foreground">{info.sourceLabel}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Invoice lahir sebagai DRAFT saat kumulatif uang muka terkonfirmasi
          mencapai ambang ini. Nilai dari snapshot penawaran, tidak berubah
          mengikuti master kategori pelanggan.
        </p>
      </div>
    </section>
  );
}
