export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getSptFilingRegisterData } from "@/lib/reports/spt-filing-data"
import { wibDateOnly } from "@/lib/utils/date-only"
import { SptFilingForm } from "../_components/spt-filing-form"

export const metadata: Metadata = { title: "Catat Lapor SPT" }

export default async function CreateSptFilingPage() {
  await requirePermission("create_spt_filings")
  const data = await getSptFilingRegisterData()
  const today = wibDateOnly(new Date())
  const defaultPeriod = today.slice(0, 7)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Register SPT", href: "/keuangan/register-spt" },
          { label: "Catat Lapor SPT" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
          Catat Pelaporan SPT (Append-Only)
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
          Simpan nomor BPE, versi SPT (Normal / Pembetulan), kurang/lebih bayar, dan saldo kompensasi Coretax tanpa memposting jurnal GL.
        </p>
      </div>

      <SptFilingForm
        taxPayments={data.taxPayments}
        defaultFiledAt={today}
        defaultPeriod={defaultPeriod}
      />
    </div>
  )
}
