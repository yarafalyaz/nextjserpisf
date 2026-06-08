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

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground whitespace-pre-wrap">{value || "-"}</span>
    </div>
  )
}

export default async function QuotationSettingsPage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Pengaturan", href: "/pengaturan" }, { label: "Penawaran" }]} />

      <Card>
        <CardHeader>
          <CardTitle>Pengaturan Penawaran</CardTitle>
          <CardDescription>Tanda tangan dan catatan kaki pada dokumen penawaran.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/penawaran/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama Tanda Tangan" value={settings?.quotationSignatureName} />
            <Field label="Catatan Footer" value={settings?.quotationFooterNotes} />
          </div>
          {settings?.quotationSignatureImage && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Gambar Tanda Tangan</span>
                <SafeImage src={settings.quotationSignatureImage} alt="Tanda Tangan" width={120} height={60} className="w-28 h-14 rounded-lg border object-contain p-1" />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
