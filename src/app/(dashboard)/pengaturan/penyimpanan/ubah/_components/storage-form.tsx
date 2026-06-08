"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/shadcn/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/shadcn/card"
import { Cloud, HardDrive, Loader2 } from "lucide-react"
import { updateStorageSettings } from "@/actions/settings.actions"
import { showError } from "@/lib/utils/toast"

interface StorageFormProps {
  driver: string
  assetBaseUrl: string
  r2AccountId: string
  r2AccessKeyId: string
  r2Bucket: string
  hasSecret: boolean
}

function isRedirectError(error: unknown): error is { digest: string } {
  return (
    typeof error === "object" && error !== null && "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  )
}

export function StorageForm({ driver, assetBaseUrl, r2AccountId, r2AccessKeyId, r2Bucket, hasSecret }: StorageFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedDriver, setSelectedDriver] = useState(driver || "local")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await updateStorageSettings(new FormData(e.currentTarget))
      } catch (error) {
        if (isRedirectError(error)) throw error
        showError(error instanceof Error ? error.message : "Gagal menyimpan konfigurasi")
      }
    })
  }

  const driverOptions = [
    { value: "local", label: "Penyimpanan Lokal", desc: "File disimpan di server (public/uploads)", icon: HardDrive },
    { value: "r2", label: "Cloudflare R2", desc: "Object storage S3-compatible + CDN", icon: Cloud },
  ]

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="storageDriver" value={selectedDriver} />

      {/* Driver picker */}
      <Card>
        <CardHeader>
          <CardTitle>Lokasi Penyimpanan</CardTitle>
          <CardDescription>Pilih ke mana file upload disimpan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {driverOptions.map((opt) => {
              const Icon = opt.icon
              const active = selectedDriver === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelectedDriver(opt.value)}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-accent"
                  }`}
                >
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* CDN Base URL */}
      <Card>
        <CardHeader>
          <CardTitle>CDN Base URL</CardTitle>
          <CardDescription>
            Opsional. Kalau diisi, semua file diakses lewat URL ini. Cocok untuk Cloudflare CDN/R2 public domain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assetBaseUrl">Base URL</Label>
            <Input id="assetBaseUrl" name="assetBaseUrl" placeholder="https://cdn.domainmu.com" defaultValue={assetBaseUrl} />
            <p className="text-xs text-muted-foreground">Kosongkan untuk pakai path relatif (/uploads/...).</p>
          </div>
        </CardContent>
      </Card>

      {/* R2 credentials — only relevant when driver is r2 */}
      {selectedDriver === "r2" && (
        <Card>
          <CardHeader>
            <CardTitle>Kredensial Cloudflare R2</CardTitle>
            <CardDescription>
              Dapatkan dari dashboard Cloudflare &gt; R2 &gt; Manage API Tokens. Install dulu paket{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">@aws-sdk/client-s3</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r2AccountId">Account ID</Label>
                <Input id="r2AccountId" name="r2AccountId" defaultValue={r2AccountId} placeholder="abc123..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r2Bucket">Bucket</Label>
                <Input id="r2Bucket" name="r2Bucket" defaultValue={r2Bucket} placeholder="yara-assets" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r2AccessKeyId">Access Key ID</Label>
                <Input id="r2AccessKeyId" name="r2AccessKeyId" defaultValue={r2AccessKeyId} placeholder="..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="r2SecretAccessKey">Secret Access Key</Label>
                <Input
                  id="r2SecretAccessKey"
                  name="r2SecretAccessKey"
                  type="password"
                  placeholder={hasSecret ? "•••••••• (biarkan kosong jika tidak diubah)" : "Masukkan secret key"}
                />
                <p className="text-xs text-muted-foreground">
                  {hasSecret ? "Sudah tersimpan. Isi hanya jika ingin mengganti." : "Belum diset."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {isPending ? "Menyimpan..." : "Simpan Konfigurasi"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/pengaturan/penyimpanan")}>
          Batal
        </Button>
      </div>
    </form>
  )
}
