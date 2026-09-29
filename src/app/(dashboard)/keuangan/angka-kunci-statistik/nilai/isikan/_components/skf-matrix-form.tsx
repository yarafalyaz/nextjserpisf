"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { getSkfValues, upsertBulkSkfValues } from "@/actions/skf-values.actions"
import { showSuccess, showError } from "@/lib/utils/toast"

interface Props {
  skfs: { id: number; code: string | null; name: string; unit: string }[]
  costCenters: { id: number; code: string; name: string }[]
  periods: string[]
}

export function SkfMatrixForm({ skfs, costCenters, periods }: Props) {
  const router = useRouter()
  const [skfId, setSkfId] = useState("")
  const [period, setPeriod] = useState(periods[0] ?? "")
  const [values, setValues] = useState<Record<number, string> | null>(null)
  const [isPending, setIsPending] = useState(false)

  const selectedSkf = useMemo(
    () => skfs.find((s) => String(s.id) === skfId),
    [skfs, skfId],
  )

  const handleSkfChange = (v: string | null) => {
    setSkfId(v ?? "")
    setValues(null)
  }

  const handlePeriodChange = (v: string | null) => {
    setPeriod(v ?? "")
    setValues(null)
  }

  useEffect(() => {
    if (!skfId || !period) return
    let cancelled = false
    getSkfValues({
      skfId: Number(skfId),
      period,
    }).then((res) => {
      if (cancelled) return
      if (res.success) {
        const map: Record<number, string> = {}
        for (const v of res.data) {
          if (v.costCenterId) map[v.costCenterId] = String(v.value)
        }
        setValues(map)
      } else {
        setValues({})
      }
    })
    return () => { cancelled = true }
  }, [skfId, period])

  async function handleSave() {
    if (!skfId || !period) return
    setIsPending(true)
    const data = costCenters.map((cc) => ({
      costCenterId: cc.id,
      value: Number((values ?? {})[cc.id] ?? 0),
    }))
    const res = await upsertBulkSkfValues(Number(skfId), period, data)
    if (res.success) {
      showSuccess("Nilai berhasil disimpan")
      router.refresh()
    } else {
      showError(res.error || "Gagal menyimpan")
    }
    setIsPending(false)
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label>Key Figure *</Label>
          <Combobox
            options={skfs.map((s) => ({ value: String(s.id), label: `${s.code ? s.code + " — " : ""}${s.name} (${s.unit})` }))}
            value={skfId}
            onChange={handleSkfChange}
            placeholder="Pilih key figure..."
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Periode *</Label>
          <Combobox
            options={periods.map((p) => ({ value: p, label: p }))}
            value={period}
            onChange={handlePeriodChange}
            placeholder="Pilih periode..."
          />
        </div>
      </div>

      {selectedSkf && period && (
        <>
          <div className="border-t border-default pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Masukkan nilai <strong>{selectedSkf.name}</strong> ({selectedSkf.unit}) untuk periode <strong>{period}</strong> per Pusat Biaya
            </p>

            {values === null ? (
              <p className="text-sm text-muted-foreground">Memuat data...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-default">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Kode</th>
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Pusat Biaya</th>
                      <th className="text-right py-2 font-medium text-muted-foreground w-48">
                        Nilai ({selectedSkf.unit})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {costCenters.map((cc) => (
                      <tr key={cc.id} className="border-b border-default/50 hover:bg-muted/30">
                        <td className="py-2 pr-4 text-muted-foreground">{cc.code}</td>
                        <td className="py-2 pr-4">{cc.name}</td>
                        <td className="py-2">
                          <Input
                            type="number"
                            step="0.0001"
                            value={values[cc.id] ?? ""}
                            onChange={(e) => setValues((prev) => ({ ...(prev ?? {}), [cc.id]: e.target.value }))}
                            placeholder="0"
                            className="text-right h-9"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-default">
            <Button variant="outline" onPress={() => router.back()}>Batal</Button>
            <Button variant="primary" isDisabled={isPending || values === null} onPress={handleSave}>
              {isPending ? "Menyimpan..." : "Simpan Nilai"}
            </Button>
          </div>
        </>
      )}

      {!skfId && (
        <div className="text-center py-12 text-muted-foreground">
          Pilih Key Figure dan Periode untuk memulai input
        </div>
      )}
    </div>
  )
}
