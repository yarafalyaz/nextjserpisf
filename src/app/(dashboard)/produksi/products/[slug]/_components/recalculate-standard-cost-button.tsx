"use client"

import { useTransition } from "react"
import { Calculator } from "lucide-react"
import { useRouter } from "next/navigation"
import { calculateStandardCost } from "@/actions/manufacturing.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

/**
 * Recompute a product's standard cost from its BOM (Σ material.qty × item
 * standard cost) and persist it. Wires the previously-unreachable
 * `calculateStandardCost` action to the product detail page so the stored
 * rollup can be refreshed after material costs change.
 */
export function RecalculateStandardCostButton({ productId }: { productId: number }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      variant="outline"
      isDisabled={isPending}
      onPress={() =>
        startTransition(async () => {
          const res = await calculateStandardCost(productId)
          if (res.success) {
            showSuccess("Harga pokok standar dihitung ulang.")
            router.refresh()
          } else {
            showError(res.error || "Gagal menghitung harga pokok standar.")
          }
        })
      }
    >
      <Calculator size={14} /> {isPending ? "Menghitung..." : "Hitung Ulang HPP Standar"}
    </Button>
  )
}
