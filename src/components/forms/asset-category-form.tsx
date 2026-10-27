"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"

export interface AssetCategoryAccountOption {
  id: number
  code: string
  name: string
}

export interface AssetCategoryFormValue {
  id: number
  name: string
  code?: string | null
  depreciationRate?: number | null
  usefulLife?: number | null
  taxDepreciationRate?: number | null
  taxUsefulLife?: number | null
  taxGroupCode?: string | null
  taxTypeListed?: boolean | null
  taxDjpDetermination?: boolean | null
  /** Metode fiskal tersimpan F-109-V; null = belum dipilih (UI tidak memilihkan). */
  fiscalMethod?: string | null
  assetAccountId?: number | null
  accumulatedDepreciationAccountId?: number | null
  depreciationExpenseAccountId?: number | null
  gainLossAccountId?: number | null
  revaluationSurplusAccountId?: number | null
  impairmentLossAccountId?: number | null
  accumulatedImpairmentAccountId?: number | null
}

export function AssetCategoryForm({
  category,
  accounts = [],
}: {
  category?: AssetCategoryFormValue
  accounts?: AssetCategoryAccountOption[]
} = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const accountOptions = accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const { createAssetCategory, updateAssetCategory } = await import("@/actions/asset.actions")
        const result = category?.id ? await updateAssetCategory(category.id, formData) : await createAssetCategory(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(category?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={category?.id ? "Formulir ubah kategori aset" : "Formulir tambah kategori aset"}
    >
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode</Label>
            <Input id="code" name="code" placeholder="Contoh: AC-001" defaultValue={category?.code ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Nama Kategori <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input id="name" name="name" placeholder="Nama kategori aset" required defaultValue={category?.name ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="depreciationRate">Tingkat Depresiasi (%)</Label>
            <Input id="depreciationRate" name="depreciationRate" type="number" step="0.01" min="0" placeholder="0" defaultValue={category?.depreciationRate ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="usefulLife">Umur Manfaat (tahun)</Label>
            <Input id="usefulLife" name="usefulLife" type="number" min="0" placeholder="0" defaultValue={category?.usefulLife ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Penyusutan Fiskal (Pajak)">
          <p className="text-xs text-muted-foreground">
            Kelompok fiskal PMK 72/2023 menentukan tarif statutoris laporan Perbedaan Penyusutan.
            Jenis tercantum tanpa kelompok = fiskal belum dihitung; jenis tidak tercantum tanpa
            kelompok = Kelompok 3 (default statutoris). Penetapan DJP mengalahkan default.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxGroupCode">Kelompok Fiskal</Label>
            <FormSelect id="taxGroupCode" name="taxGroupCode" placeholder="-- Belum ditentukan --" options={[
              { value: "GROUP_1", label: "Kelompok 1 (4 tahun)" },
              { value: "GROUP_2", label: "Kelompok 2 (8 tahun)" },
              { value: "GROUP_3", label: "Kelompok 3 (16 tahun)" },
              { value: "GROUP_4", label: "Kelompok 4 (20 tahun)" },
              { value: "BUILDING_PERMANENT", label: "Bangunan permanen (20 tahun)" },
              { value: "BUILDING_NON_PERMANENT", label: "Bangunan tidak permanen (10 tahun)" },
            ]} defaultValue={category?.taxGroupCode ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxTypeListed">Jenis Harta di Lampiran PMK 72/2023</Label>
            <FormSelect id="taxTypeListed" name="taxTypeListed" placeholder="-- Belum dinyatakan --" options={[
              { value: "true", label: "Tercantum" },
              { value: "false", label: "Tidak tercantum" },
            ]} defaultValue={category?.taxTypeListed == null ? "" : String(category.taxTypeListed)} />
          </div>
          <div className="flex items-center gap-2">
            <input id="taxDjpDetermination" name="taxDjpDetermination" type="checkbox" value="true" defaultChecked={!!category?.taxDjpDetermination} className="size-4 min-h-11 min-w-11 rounded border-default sm:min-h-4 sm:min-w-4" />
            <Label htmlFor="taxDjpDetermination">Ada penetapan DJP untuk jenis ini</Label>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fiscalMethod">Metode Fiskal</Label>
            <FormSelect id="fiscalMethod" name="fiscalMethod" placeholder="-- Belum dipilih --" options={[
              { value: "straight_line", label: "Garis Lurus" },
              { value: "declining_balance", label: "Saldo Menurun" },
            ]} defaultValue={category?.fiscalMethod ?? ""} />
            <p className="text-xs text-muted-foreground">
              Belum dipilih = penyusutan fiskal belum dihitung (tidak diganti garis lurus).
              Bangunan hanya boleh garis lurus — saldo menurun untuk kelompok bangunan ditolak server.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxDepreciationRate">Tarif Fiskal (%)</Label>
            <Input id="taxDepreciationRate" name="taxDepreciationRate" type="number" step="0.01" min="0" placeholder="0" defaultValue={category?.taxDepreciationRate ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxUsefulLife">Umur Fiskal (tahun)</Label>
            <Input id="taxUsefulLife" name="taxUsefulLife" type="number" min="0" placeholder="0" defaultValue={category?.taxUsefulLife ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Mapping Akun (opsional)">
          <p className="text-xs text-muted-foreground">
            Akun per kategori ini menimpa Mapping Akun global saat posting jurnal akuisisi / penyusutan /
            pelepasan aset kategori ini. Kosongkan untuk memakai Mapping Akun global (Pengaturan → Mapping Akun).
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assetAccountId">Akun Aset Tetap</Label>
            <FormSelect id="assetAccountId" name="assetAccountId" placeholder="-- Pakai mapping global --" options={accountOptions} defaultValue={category?.assetAccountId ? String(category.assetAccountId) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accumulatedDepreciationAccountId">Akun Akumulasi Penyusutan</Label>
            <FormSelect id="accumulatedDepreciationAccountId" name="accumulatedDepreciationAccountId" placeholder="-- Pakai mapping global --" options={accountOptions} defaultValue={category?.accumulatedDepreciationAccountId ? String(category.accumulatedDepreciationAccountId) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="depreciationExpenseAccountId">Akun Beban Penyusutan</Label>
            <FormSelect id="depreciationExpenseAccountId" name="depreciationExpenseAccountId" placeholder="-- Pakai mapping global --" options={accountOptions} defaultValue={category?.depreciationExpenseAccountId ? String(category.depreciationExpenseAccountId) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gainLossAccountId">Akun Laba/Rugi Pelepasan</Label>
            <FormSelect id="gainLossAccountId" name="gainLossAccountId" placeholder="-- Pakai mapping global --" options={accountOptions} defaultValue={category?.gainLossAccountId ? String(category.gainLossAccountId) : ""} />
          </div>
        </FormSection>

        <FormSection title="Mapping Akun Peristiwa Perubahan Aset">
          <p className="text-xs text-muted-foreground">
            Akun peristiwa revaluasi / penurunan nilai kategori ini (F-111/F-128). Berbeda dari mapping
            global di atas: kosong = belum terpetakan, dan peristiwa terkait ditolak berisik oleh server
            (gagal tertutup) — bukan dialihkan ke akun lain. Surplus revaluasi wajib akun ekuitas, beban
            penurunan nilai wajib akun beban, akumulasi penurunan nilai wajib akun kontra-aset.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="revaluationSurplusAccountId">Akun Surplus Revaluasi</Label>
            <FormSelect id="revaluationSurplusAccountId" name="revaluationSurplusAccountId" placeholder="-- Belum terpetakan --" options={accountOptions} defaultValue={category?.revaluationSurplusAccountId ? String(category.revaluationSurplusAccountId) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="impairmentLossAccountId">Akun Beban Penurunan Nilai</Label>
            <FormSelect id="impairmentLossAccountId" name="impairmentLossAccountId" placeholder="-- Belum terpetakan --" options={accountOptions} defaultValue={category?.impairmentLossAccountId ? String(category.impairmentLossAccountId) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="accumulatedImpairmentAccountId">Akun Akumulasi Penurunan Nilai</Label>
            <FormSelect id="accumulatedImpairmentAccountId" name="accumulatedImpairmentAccountId" placeholder="-- Belum terpetakan --" options={accountOptions} defaultValue={category?.accumulatedImpairmentAccountId ? String(category.accumulatedImpairmentAccountId) : ""} />
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : category?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
