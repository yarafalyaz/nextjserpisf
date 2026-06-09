export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Separator } from "@/components/ui/shadcn/separator"
import { AlertTriangle, CheckCircle2, Cloud, HardDrive, Pencil } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyimpanan" }

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-foreground ${mono ? "font-mono break-all" : ""}`}>{value || "-"}</span>
    </div>
  )
}

function maskSecret(secret: string | null | undefined): string {
  if (!secret) return "-"
  if (secret.length <= 4) return "••••"
  return `${"•".repeat(8)}${secret.slice(-4)}`
}

export default async function StorageSettingsPage() {
  await requirePermission("manage_settings")
  const settings = await prisma.systemSetting.findFirst()

  const driver = settings?.storageDriver || "local"
  const isR2 = driver === "r2"
  const r2Complete = isR2 && !!(settings?.r2AccountId && settings?.r2AccessKeyId && settings?.r2SecretAccessKey && settings?.r2Bucket)

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Penyimpanan & CDN" },
      ]} />

      <Card>
        <CardHeader>
          <CardTitle>Penyimpanan & CDN</CardTitle>
          <CardDescription>Lokasi penyimpanan file upload dan konfigurasi CDN.</CardDescription>
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link href="/pengaturan/penyimpanan/ubah"><Pencil className="size-3.5" /> Ubah</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Driver status */}
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {isR2 ? <Cloud className="size-5" /> : <HardDrive className="size-5" />}
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isR2 ? "Cloudflare R2" : "Penyimpanan Lokal"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isR2 ? "File diunggah ke object storage Cloudflare R2" : "File disimpan di server (public/uploads)"}
                </p>
              </div>
            </div>
            {isR2 ? (
              r2Complete ? (
                <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" /> Terkonfigurasi
                </Badge>
              ) : (
                <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                  <AlertTriangle className="size-3.5" /> Belum lengkap
                </Badge>
              )
            ) : (
              <Badge variant="outline">Aktif</Badge>
            )}
          </div>

          <Field label="CDN Base URL" value={settings?.assetBaseUrl} mono />
          <p className="-mt-4 text-xs text-muted-foreground">
            Kalau diisi, semua file diakses lewat URL ini (mis. https://cdn.domainmu.com). Kosong = path relatif (/uploads/...).
          </p>

          {isR2 && (
            <>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Mode Hybrid (Fallback Lokal)</p>
                  <p className="text-xs text-muted-foreground">Simpan ke lokal jika upload R2 gagal</p>
                </div>
                {settings?.storageFallbackLocal ? (
                  <Badge variant="outline" className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">Aktif</Badge>
                ) : (
                  <Badge variant="outline">Nonaktif</Badge>
                )}
              </div>
              <Separator />
              <h4 className="text-sm font-semibold text-foreground">Kredensial Cloudflare R2</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Account ID" value={settings?.r2AccountId} mono />
                <Field label="Bucket" value={settings?.r2Bucket} mono />
                <Field label="Access Key ID" value={settings?.r2AccessKeyId} mono />
                <Field label="Secret Access Key" value={maskSecret(settings?.r2SecretAccessKey)} mono />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
