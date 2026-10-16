"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { runSetup } from "@/actions/setup.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Button } from "@/components/ui/button"
import { AddressPicker } from "@/components/ui/address-picker"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"

export function SetupForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await runSetup(formData)
        if (!result?.success) {
          setError(result?.error ?? "Instalasi gagal")
          showError(result?.error ?? "Instalasi gagal")
          return
        }
        showSuccess("Instalasi selesai. Lanjutkan penyelesaian pengaturan.")
        router.push(result.redirectTo ?? "/login?setup=done")
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Instalasi gagal"
        setError(message)
        showError(message)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormCard>
        <FormSection
          title="Data Perusahaan"
          description="Identitas ini dipakai pada kop laporan dan judul aplikasi."
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyName">Nama Perusahaan *</Label>
            <Input id="companyName" name="companyName" required placeholder="mis. PT Sumber Makmur" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyPhone">Telepon</Label>
            <Input id="companyPhone" name="companyPhone" placeholder="mis. 021-1234567" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyEmail">Email Perusahaan</Label>
            <Input id="companyEmail" name="companyEmail" type="email" placeholder="info@perusahaan.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyWebsite">Website</Label>
            <Input id="companyWebsite" name="companyWebsite" placeholder="https://..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyTaxId">NPWP</Label>
            <Input id="companyTaxId" name="companyTaxId" placeholder="XX.XXX.XXX.X-XXX.XXX" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="companyAddress">Alamat</Label>
            <Textarea id="companyAddress" name="companyAddress" rows={2} placeholder="Alamat lengkap" />
          </div>
          <div className="col-span-full">
            <AddressPicker prefix="company" />
          </div>
        </FormSection>

        <FormSection
          title="Akun Administrator"
          description="Akun ini akan menjadi super admin dengan akses penuh."
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminName">Nama Administrator *</Label>
            <Input id="adminName" name="adminName" required placeholder="mis. Budi Santoso" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminEmail">Email *</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required placeholder="admin@perusahaan.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminPassword">Kata Sandi *</Label>
            <Input id="adminPassword" name="adminPassword" type="password" required minLength={8} placeholder="Minimal 8 karakter" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi *</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" required />
          </div>
        </FormSection>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <FormActions>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyiapkan..." : "Install Sekarang"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
