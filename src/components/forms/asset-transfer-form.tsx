"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface AssetTransferFormProps {
  assets: { id: number; code: string; name: string; location: string | null }[]
  employees?: { id: number; name: string }[]
  transfer?: { id: number; assetId: number; fromEmployeeId?: number | null; toEmployeeId?: number | null; transferDate: string; fromLocation?: string | null; toLocation?: string | null; notes?: string | null }
}

export function AssetTransferForm({ assets, employees = [], transfer }: AssetTransferFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [transferDate, setTransferDate] = useState(transfer?.transferDate || new Date().toISOString().split("T")[0])
  const [assetId, setAssetId] = useState(transfer?.assetId ? String(transfer.assetId) : "")
  const [fromEmployeeId, setFromEmployeeId] = useState(transfer?.fromEmployeeId ? String(transfer.fromEmployeeId) : "")
  const [toEmployeeId, setToEmployeeId] = useState(transfer?.toEmployeeId ? String(transfer.toEmployeeId) : "")

  const selectedAsset = assets.find((a) => a.id === Number(assetId))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetTransfer, updateAssetTransfer } = await import("@/actions/asset.actions")
        if (transfer?.id) {

          await updateAssetTransfer(transfer.id, formData)

        } else {

          await createAssetTransfer(formData)

        }
        showSuccess(transfer?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/aset/transfer")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label>Aset *</Label>
            <Combobox
              name="assetId"
              value={assetId || null}
              onChange={(key) => setAssetId(key ?? "")}
              placeholder="Cari aset..."
              options={assets.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Transfer *" name="transferDate" value={transferDate} onChange={setTransferDate} required />
          </div>
        </FormSection>
        <FormSection title="Detail Transfer">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fromLocation">Dari Lokasi</Label>
            <Input id="fromLocation" name="fromLocation" defaultValue={transfer?.fromLocation ?? selectedAsset?.location ?? ""} placeholder="Lokasi asal" readOnly={!!selectedAsset?.location} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="toLocation">Ke Lokasi *</Label>
            <Input id="toLocation" name="toLocation" defaultValue={transfer?.toLocation ?? ""} placeholder="Lokasi tujuan" required />
          </div>
          {employees.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Dari Karyawan</Label>
                <Combobox
                  name="fromEmployeeId"
                  value={fromEmployeeId || null}
                  onChange={(key) => setFromEmployeeId(key ?? "")}
                  placeholder="Cari karyawan..."
                  options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ke Karyawan</Label>
                <Combobox
                  name="toEmployeeId"
                  value={toEmployeeId || null}
                  onChange={(key) => setToEmployeeId(key ?? "")}
                  placeholder="Cari karyawan..."
                  options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
                />
              </div>
            </>
          )}
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="Catatan transfer..." />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : transfer?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
