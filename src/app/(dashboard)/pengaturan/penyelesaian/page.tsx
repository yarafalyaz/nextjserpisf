export const dynamic = "force-dynamic"

import Link from "next/link"
import { requirePermission } from "@/lib/auth/permissions"
import { loadSettingsForEdit } from "../ubah/_lib/load-settings"
import { ACCOUNT_MAPPING_FIELDS } from "@/lib/utils/account-automap"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from "@/components/ui/shadcn/card"
import { Badge } from "@/components/ui/shadcn/badge"
import { Button } from "@/components/ui/shadcn/button"
import { CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyelesaian Pengaturan" }

interface ChecklistStep {
  title: string
  description: string
  href: string
  done: boolean
  status: string
}

export default async function SettingsCompletionPage() {
  await requirePermission("manage_settings")

  const { settings } = await loadSettingsForEdit()
  if (!settings) {
    return <div className="p-6 text-destructive">Pengaturan tidak ditemukan.</div>
  }

  const values = settings as unknown as Record<string, unknown>
  const isSet = (key: string) => {
    const value = values[key]
    return value !== null && value !== undefined && value !== ""
  }
  const allSet = (keys: string[]) => keys.every(isSet)

  const mappedAccounts = ACCOUNT_MAPPING_FIELDS.filter(isSet).length
  const totalAccounts = ACCOUNT_MAPPING_FIELDS.length

  const steps: ChecklistStep[] = [
    {
      title: "Mapping Akun",
      description:
        "Akun buku besar untuk posting jurnal otomatis. Sudah diisi otomatis saat instalasi — periksa dan sesuaikan bila perlu.",
      href: "/pengaturan/mapping-akun/ubah",
      done: mappedAccounts === totalAccounts,
      status: `${mappedAccounts}/${totalAccounts} akun terisi`,
    },
    {
      title: "Penomoran Dokumen",
      description: "Prefix dan format nomor dokumen otomatis (barang, faktur, pesanan, dst).",
      href: "/pengaturan/penomoran/ubah",
      done: allSet(["documentNumberFormat", "itemCodePrefix", "salesInvoicePrefix", "purchaseOrderPrefix"]),
      status: "Format & prefix nomor dokumen",
    },
    {
      title: "Lembur & Kehadiran",
      description: "Koefisien lembur, radius absensi, dan potongan keterlambatan.",
      href: "/pengaturan/lembur-kehadiran/ubah",
      done: allSet(["overtimeCoefficient", "attendanceRadiusKm", "latePenaltyPerMinute"]),
      status: "Parameter lembur, absensi & potongan",
    },
    {
      title: "Preferensi",
      description: "Mata uang, periode fiskal, dan metode HPP.",
      href: "/pengaturan/preferensi/ubah",
      done: allSet(["currencyCode", "costingMethod", "fiscalYearStartMonth"]),
      status: "Mata uang, fiskal & metode HPP",
    },
    {
      title: "Penawaran",
      description: "Nama penandatangan dan catatan kaki surat penawaran (opsional).",
      href: "/pengaturan/penawaran/ubah",
      done: isSet("quotationCodePrefix"),
      status: "Tanda tangan & catatan kaki",
    },
  ]

  const pending = steps.filter((step) => !step.done).length

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Penyelesaian Pengaturan" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Penyelesaian Pengaturan</h1>
        <p className="text-sm text-muted-foreground">
          Selesaikan konfigurasi berikut agar seluruh modul berjalan dengan benar.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status Konfigurasi</CardTitle>
          <CardDescription>
            {pending === 0
              ? "Semua konfigurasi wajib sudah lengkap."
              : `${pending} bagian masih perlu diperiksa.`}
          </CardDescription>
          <CardAction>
            {pending === 0 ? (
              <Badge variant="outline" className="gap-1 text-emerald-600">
                <CheckCircle2 className="size-3.5" /> Selesai
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-amber-600">
                <AlertTriangle className="size-3.5" /> {pending} tertunda
              </Badge>
            )}
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {steps.map((step) => (
            <div
              key={step.href}
              className="flex items-center gap-3 rounded-lg border bg-card p-4"
            >
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="size-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
                <p className="mt-1 text-xs font-medium text-foreground">{step.status}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={step.href}>
                  Atur <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
