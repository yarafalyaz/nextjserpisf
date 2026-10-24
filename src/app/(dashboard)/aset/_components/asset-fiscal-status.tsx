import { Badge } from "@/components/ui/shadcn/badge"
import { resolveFiscalGroup, type FiscalGroupInput } from "@/lib/finance/asset-fiscal-groups"

/** Label metode penyusutan komersial (enum backend `DEPRECIATION_METHODS`). */
export const DEPRECIATION_METHOD_LABELS: Record<string, string> = {
  straight_line: "Garis Lurus",
  declining_balance: "Saldo Menurun",
  units_of_production: "Unit Produksi (analitis, tanpa jurnal)",
  sum_of_years_digits: "Jumlah Angka Tahun (analitis, tanpa jurnal)",
}

/** Label metode fiskal tersimpan kategori (F-109-V); null = belum dipilih. */
export const FISCAL_METHOD_LABELS: Record<string, string> = {
  straight_line: "Garis Lurus",
  declining_balance: "Saldo Menurun",
}

export function fiscalMethodLabel(fiscalMethod: string | null | undefined): string {
  if (!fiscalMethod) return "Metode fiskal belum dipilih"
  return FISCAL_METHOD_LABELS[fiscalMethod] ?? fiscalMethod
}

/**
 * Status fiskal kategori/aset dari `resolveFiscalGroup` (vonis F-2026-10-22-062-V
 * Putusan 2) — ditampilkan apa adanya, tanpa angka fiskal bila belum-dihitung.
 * Pure presentasi: tidak menghitung tarif/nominal apa pun.
 */
export function AssetFiscalStatus(input: FiscalGroupInput & { fiscalMethod?: string | null }) {
  const resolution = resolveFiscalGroup(input)
  const methodLine = input.fiscalMethod !== undefined ? (
    <span className="text-xs text-muted-foreground">{`Metode fiskal: ${fiscalMethodLabel(input.fiscalMethod)}`}</span>
  ) : null
  if (resolution.status !== "resolved") {
    return (
      <span className="inline-flex flex-col gap-0.5">
        <Badge className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
          Fiskal belum dihitung
        </Badge>
        {methodLine}
        <span className="text-xs text-muted-foreground">
          {resolution.reason === "unknown-group"
            ? "Kelompok fiskal tidak dikenal — periksa master kategori."
            : input.taxTypeListed === true
              ? "Jenis tercantum di PMK 72/2023 tetapi kelompok fiskal belum diisi."
              : "Status jenis harta (tercantum/tidak) belum dinyatakan di kategori."}
        </span>
      </span>
    )
  }
  const suffix =
    resolution.source === "statutory-default"
      ? " (default statutoris)"
      : resolution.source === "djp"
        ? " (penetapan DJP)"
        : ""
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
        Fiskal terhitung
      </Badge>
      {methodLine}
      <span className="text-xs text-muted-foreground">{`${resolution.group.label}${suffix}`}</span>
    </span>
  )
}
