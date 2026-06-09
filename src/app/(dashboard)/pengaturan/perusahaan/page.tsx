export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { SafeImage } from "@/components/ui/safe-image"
import { Button } from "@/components/ui/shadcn/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Separator } from "@/components/ui/shadcn/separator"
import { Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perusahaan" }

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value || "-"}</span>
    </div>
  )
}

export default async function CompanySettingsPage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Perusahaan" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Informasi Perusahaan</CardTitle>
          <CardDescription>Identitas dan alamat resmi untuk dokumen dan faktur.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/perusahaan/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nama Perusahaan" value={settings?.companyName} />
            <Field label="Email" value={settings?.companyEmail} />
            <Field label="Telepon" value={settings?.companyPhone} />
            <Field label="Website" value={settings?.companyWebsite} />
            <Field label="NPWP" value={settings?.companyTaxId} />
            <Field label="Provinsi" value={settings?.companyProvince} />
            <Field label="Kota" value={settings?.companyCity} />
            <Field label="Kecamatan" value={settings?.companyDistrict} />
            <Field label="Kelurahan" value={settings?.companyVillage} />
            <Field label="Kode Pos" value={settings?.companyPostalCode} />
          </div>
          {settings?.companyAddress && (
            <>
              <Separator />
              <Field label="Alamat Lengkap" value={settings.companyAddress} />
            </>
          )}
          {settings?.companyLogo && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Logo</span>
                <SafeImage src={settings.companyLogo} alt="Logo" width={80} height={80} className="size-20 rounded-lg border object-contain p-1" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
