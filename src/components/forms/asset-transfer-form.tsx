"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface AssetTransferFormProps {
  assets: { id: number; code: string; name: string; location: string | null }[]
  employees?: { id: number; name: string }[]
  transfer?: { id: number; assetId: number; fromEmployeeId?: number | null; toEmployeeId?: number | null; transferDate: string; notes?: string | null }
}

export function AssetTransferForm({ assets, employees = [], transfer }: AssetTransferFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0])
  const [assetId, setAssetId] = useState("")

  const selectedAsset = assets.find((a) => a.id === Number(assetId))

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetTransfer, updateAssetTransfer } = await import("@/actions/asset.actions")
        transfer?.id ? await updateAssetTransfer(transfer.id, formData) : await createAssetTransfer(formData)
        showSuccess(transfer?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
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
            <ComboBox name="assetId" selectedKey={assetId || null} onSelectionChange={(key) => setAssetId(key ? String(key) : "")} className="w-full" isRequired>
              <Label>Aset *</Label>
              <ComboBox.InputGroup><Input placeholder="Cari aset..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {assets.map((a) => (
                    <ListBox.Item key={a.id} id={String(a.id)} textValue={`${a.code} - ${a.name}`}>{a.code} - {a.name}</ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Transfer *" name="transferDate" value={transferDate} onChange={setTransferDate} required />
          </div>
        </FormSection>
        <FormSection title="Detail Transfer">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fromLocation">Dari Lokasi</Label>
            <Input id="fromLocation" name="fromLocation" defaultValue={selectedAsset?.location || ""} placeholder="Lokasi asal" readOnly={!!selectedAsset?.location} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="toLocation">Ke Lokasi *</Label>
            <Input id="toLocation" name="toLocation" placeholder="Lokasi tujuan" required />
          </div>
          {employees.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <ComboBox name="fromEmployeeId" defaultSelectedKey={transfer?.fromEmployeeId ? String(transfer.fromEmployeeId) : undefined} className="w-full">
                  <Label>Dari Karyawan</Label>
                  <ComboBox.InputGroup><Input placeholder="Cari karyawan..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {employees.map((emp) => (
                        <ListBox.Item key={emp.id} id={String(emp.id)} textValue={emp.name}>{emp.name}</ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>
              <div className="flex flex-col gap-1.5">
                <ComboBox name="toEmployeeId" defaultSelectedKey={transfer?.toEmployeeId ? String(transfer.toEmployeeId) : undefined} className="w-full">
                  <Label>Ke Karyawan</Label>
                  <ComboBox.InputGroup><Input placeholder="Cari karyawan..." /><ComboBox.Trigger /></ComboBox.InputGroup>
                  <ComboBox.Popover>
                    <ListBox>
                      {employees.map((emp) => (
                        <ListBox.Item key={emp.id} id={String(emp.id)} textValue={emp.name}>{emp.name}</ListBox.Item>
                      ))}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </div>
            </>
          )}
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <TextArea id="notes" name="notes" rows={3} placeholder="Catatan transfer..." />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : transfer?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
