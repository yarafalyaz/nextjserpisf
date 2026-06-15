"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { disposeAsset } from "@/actions/asset.actions"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { showSuccess, showError } from "@/lib/utils/toast"

/** Dispose-asset control: prompts for proceeds then records the disposal + gain/loss. */
export function DisposeAssetButton({ assetId, bookValue }: { assetId: number; bookValue: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [proceeds, setProceeds] = useState("0")
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set("assetId", String(assetId))
        fd.set("proceeds", proceeds || "0")
        const res = await disposeAsset(fd)
        if (res?.success) {
          showSuccess("Aset berhasil dilepas")
          setOpen(false)
          router.refresh()
        } else {
          showError(res?.error || "Gagal melepas aset")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal melepas aset")
      }
    })
  }

  if (!open) {
    return <Button variant="danger" onPress={() => setOpen(true)}>Lepas Aset</Button>
  }

  const p = Number(proceeds) || 0
  const gainLoss = p - bookValue
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-default p-2 bg-surface">
      <span className="text-sm text-muted-foreground" id="dispose-label">Nilai jual:</span>
      <CurrencyInput
        value={p}
        onChange={(v) => setProceeds(String(v))}
        min={0}
        prefix="Rp"
        className="w-40"
        aria-labelledby="dispose-label"
      />
      <span className={`text-xs ${gainLoss >= 0 ? "text-success" : "text-danger"}`}>
        {gainLoss >= 0 ? "Laba" : "Rugi"} Rp {Math.abs(gainLoss).toLocaleString("id-ID")}
      </span>
      <Button variant="danger" isDisabled={isPending} onPress={submit}>Konfirmasi Lepas</Button>
      <Button variant="secondary" isDisabled={isPending} onPress={() => setOpen(false)}>Batal</Button>
    </div>
  )
}
