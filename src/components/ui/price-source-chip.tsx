import { priceSourceLabel } from "@/lib/utils/price-source"
import { cn } from "@/lib/utils"

const toneClasses: Record<"tier" | "base" | "master", string> = {
  tier: "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  base: "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  master: "border-transparent bg-muted text-muted-foreground",
}

const TONE_BY_SOURCE: Record<string, keyof typeof toneClasses> = {
  price_list_tier: "tier",
  price_list_base: "base",
  item_master: "master",
}

/**
 * Chip sumber harga baris invoice (BR-TIER-09). Nilai null / tingkat tanpa
 * minQty → render null: baris lama/konversi/edit BUKAN klaim historis.
 */
export function PriceSourceChip({
  priceSource,
  priceListMinQty,
  className,
}: {
  priceSource?: string | null
  priceListMinQty?: number | null
  className?: string
}) {
  const label = priceSourceLabel(priceSource, priceListMinQty)
  if (!label || !priceSource) return null
  const tone = TONE_BY_SOURCE[priceSource]
  if (!tone) return null
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
