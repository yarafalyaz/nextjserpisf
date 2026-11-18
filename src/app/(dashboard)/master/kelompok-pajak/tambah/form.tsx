"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { createTaxGroup } from "@/actions/master.actions"
import { showError } from "@/lib/utils/toast"
import { runUiAction } from "@/components/ui/async-action"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"
import { FormActions } from "@/components/ui/form-section"

interface Props {
  taxes: { id: number; name: string; rate: number }[]
}

export function TaxGroupForm({ taxes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      await runUiAction(async () => {
        const res = await createTaxGroup(formData)
        if (!res.success) {
          // Jangan pura-pura sukses: validasi server (mis. belum memilih
          // pajak) dulu tertelan dan pengguna terlempar ke daftar kosong.
          showError(res.error ?? "Gagal membuat kelompok pajak")
          return
        }
        router.push("/master/kelompok-pajak")
        router.refresh()
      }, "Gagal membuat kelompok pajak")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Grup *</Label>
          <Input id="name" name="name" required />
        </div>
        <fieldset aria-labelledby="tax-options-label" className="flex flex-col gap-1.5">
          <span id="tax-options-label" className="text-sm font-medium text-foreground">Pajak</span>
          <div className="flex flex-col gap-2">
            {taxes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada pajak yang bisa dipilih.{" "}
                <Link href="/master/pajak/tambah" className="text-primary hover:underline">
                  Buat pajak dulu
                </Link>{" "}
, kelompok wajib berisi minimal satu pajak.
              </p>
            ) : null}
            {taxes.map((tax) => (
              <label key={tax.id} htmlFor={`tax-${tax.id}`} className="flex items-center gap-2 cursor-pointer">
                <Checkbox id={`tax-${tax.id}`} name="taxIds" value={String(tax.id)} />
                {tax.name} ({tax.rate}%)
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <FormActions>
        <Button className="w-full md:w-auto" type="button" onPress={() => router.back()} >Batal</Button>
        <Button className="w-full md:w-auto" type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Simpan"}
        </Button>
      </FormActions>
    </form>
  )
}
