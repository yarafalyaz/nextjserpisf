"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { createWithholdingTaxType, updateWithholdingTaxType } from "@/actions/withholding-tax.actions"

interface WithholdingTaxTypeFormProps {
  accounts: { id: number; code: string; name: string }[]
  taxType?: {
    id: number
    code: string
    name: string
    rate: number
    article: string | null
    objectCode: string | null
    liabilityAccountId: number | null
    receivableAccountId: number | null
    isActive: boolean
  }
}

const ARTICLE_OPTIONS = ["PPh21", "PPh22", "PPh23", "PPh4(2)", "PPh26", "PPh15"].map((a) => ({
  value: a,
  label: a,
}))

export function WithholdingTaxTypeForm({ accounts, taxType }: WithholdingTaxTypeFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Putaran 70: key stabil per intent create; retry memakai ulang, sukses merotasi.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const [isActive, setIsActive] = useState(taxType?.isActive ?? true)
  const [liabilityAccountId, setLiabilityAccountId] = useState<string | null>(
    taxType?.liabilityAccountId ? String(taxType.liabilityAccountId) : null,
  )
  const [receivableAccountId, setReceivableAccountId] = useState<string | null>(
    taxType?.receivableAccountId ? String(taxType.receivableAccountId) : null,
  )
  const [article, setArticle] = useState<string | null>(taxType?.article ?? null)

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("isActive", isActive ? "true" : "false")
    if (article) formData.set("article", article)
    else formData.delete("article")
    if (liabilityAccountId) formData.set("liabilityAccountId", liabilityAccountId)
    if (receivableAccountId) formData.set("receivableAccountId", receivableAccountId)
    if (!taxType?.id) formData.set("idempotencyKey", idempotencyKeyRef.current)

    startTransition(async () => {
      try {
        const result = taxType?.id
          ? await updateWithholdingTaxType(taxType.id, formData)
          : await createWithholdingTaxType(formData)
        if (!result?.success) {
          showError(result?.error ?? "Gagal menyimpan data")
          return
        }
        showSuccess(taxType?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        if (!taxType?.id) idempotencyKeyRef.current = crypto.randomUUID()
        router.push("/pengaturan/pajak-potong")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: `${a.code} — ${a.name}` }))

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={taxType?.id ? "Formulir ubah jenis pemotongan PPh" : "Formulir tambah jenis pemotongan PPh"}>
      <FormCard>
        <FormSection title="Jenis Pemotongan PPh">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Input id="code" name="code" required defaultValue={taxType?.code ?? ""} placeholder="mis. PPH23" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Input id="name" name="name" required defaultValue={taxType?.name ?? ""} placeholder="mis. PPh 23 — Jasa" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rate">Tarif (%)</Label>
            <Input id="rate" name="rate" type="number" step="0.01" min="0" max="100" defaultValue={taxType ? String(taxType.rate) : "0"} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="article">Pasal PPh</Label>
            <Combobox
              id="article"
              value={article}
              onChange={setArticle}
              placeholder="Pilih pasal..."
              options={ARTICLE_OPTIONS}
            />
            <span className="text-xs text-muted-foreground">
              Wajib diisi agar jenis ini bisa diterbitkan sebagai bukti potong.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="objectCode">Kode Objek e-Bupot</Label>
            <Input id="objectCode" name="objectCode" defaultValue={taxType?.objectCode ?? ""} placeholder="mis. 24-104-01" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="liabilityAccountId">Akun Hutang PPh</Label>
            <Combobox
              id="liabilityAccountId"
              value={liabilityAccountId}
              onChange={setLiabilityAccountId}
              placeholder="Pilih akun..."
              options={accountOptions}
            />
            <span className="text-xs text-muted-foreground">
              Wajib diisi bila PPh ini dipotong dari tagihan pemasok — jurnal pemotongan mengkredit akun ini.
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receivableAccountId">Akun PPh Dibayar Dimuka</Label>
            <Combobox
              id="receivableAccountId"
              value={receivableAccountId}
              onChange={setReceivableAccountId}
              placeholder="Pilih akun (opsional)..."
              options={accountOptions}
            />
            <span className="text-xs text-muted-foreground">Untuk PPh yang dipotong oleh pelanggan atas penjualan kita.</span>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-default"
            />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : taxType?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
