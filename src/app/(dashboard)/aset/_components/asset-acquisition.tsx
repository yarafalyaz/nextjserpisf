import { Badge } from "@/components/ui/shadcn/badge"
import { formatCurrency } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import type { AssetAcquisitionResult } from "@/lib/finance/asset-acquisition"
import {
  ACQUISITION_COUNTERPART_LABELS,
  ACQUISITION_FISCAL_BASIS_SOURCE_LABELS,
  ACQUISITION_REJECT_LABELS,
  ACQUISITION_VAT_EVIDENCE_LABELS,
  assetAcquisitionTypeDisplay,
  type AssetAcquisitionTone,
} from "@/lib/finance/asset-acquisition-display"

const TONE_CLASSES: Record<AssetAcquisitionTone, string> = {
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  default: "bg-muted text-muted-foreground",
}

/**
 * Jenis perolehan aset dari kontrak F-2026-10-23-120-V — tampil apa adanya.
 * Jenis tak terdaftar tampil sebagai temuan bernama + nilai mentahnya;
 * UI tidak menebak padanan dan tidak menampilkan label sah palsu.
 */
export function AssetAcquisitionTypeBadge({
  type,
}: {
  type: string | null | undefined
}) {
  const display = assetAcquisitionTypeDisplay(type)
  return (
    <span className="inline-flex flex-col gap-0.5">
      <Badge
        variant="outline"
        className={cn("border-transparent font-medium", TONE_CLASSES[display.tone])}
      >
        {display.label}
      </Badge>
      {display.rawType !== null && (
        <span className="text-xs text-muted-foreground">
          Nilai tersimpan: {display.rawType || "(kosong)"}
        </span>
      )}
    </span>
  )
}

/**
 * Snapshot perolehan hasil `resolveAssetAcquisition` apa adanya:
 * jenis + lawan kredit + dasar komersial/fiskal + bukti PPN.
 * UI tidak memilih dasar fiskal dan tidak menghitung harga pasar;
 * reject bernama tampil sebagai temuan, bukan status sah.
 */
export function AssetAcquisitionSummary({
  result,
  sourceDocumentRef,
}: {
  result: AssetAcquisitionResult
  sourceDocumentRef?: string | null
}) {
  if (result.status === "no-journal") {
    return (
      <p className="text-sm text-muted-foreground">
        Aset warisan tanpa harga perolehan — belum ada jurnal perolehan.
      </p>
    )
  }

  if (result.status === "reject") {
    return (
      <p className="text-sm text-muted-foreground">
        {ACQUISITION_REJECT_LABELS[result.reason] ?? result.reason}
      </p>
    )
  }

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <dt className="text-xs text-muted-foreground">Jenis Perolehan</dt>
        <dd className="mt-1">
          <AssetAcquisitionTypeBadge type={result.acquisitionType} />
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Dokumen Sumber</dt>
        <dd className="text-sm font-medium text-foreground">
          {sourceDocumentRef?.trim()
            ? sourceDocumentRef
            : "Belum ada dokumen sumber tercatat"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Lawan Kredit</dt>
        <dd className="text-sm font-medium text-foreground">
          {ACQUISITION_COUNTERPART_LABELS[result.counterpartKind]}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Dasar Komersial</dt>
        <dd className="text-sm font-medium text-foreground">
          {formatCurrency(Number(result.commercialBasis))}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Dasar Fiskal</dt>
        <dd className="text-sm font-medium text-foreground">
          {formatCurrency(Number(result.fiscalBasis))} ·{" "}
          {ACQUISITION_FISCAL_BASIS_SOURCE_LABELS[result.fiscalBasisSource]}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Penyusutan Fiskal</dt>
        <dd className="text-sm font-medium text-foreground">
          {result.fiscalDepreciable
            ? "Dapat disusutkan secara fiskal"
            : "Tidak dapat disusutkan secara fiskal"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">PPN Masukan</dt>
        <dd className="text-sm font-medium text-foreground">
          {formatCurrency(Number(result.inputVatAmount))} ·{" "}
          {ACQUISITION_VAT_EVIDENCE_LABELS[result.vatEvidence]}
        </dd>
      </div>
    </dl>
  )
}
