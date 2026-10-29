export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TaxAssessmentForm } from "../_components/tax-assessment-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftarkan Ketetapan Pajak" }

export default async function CreateTaxAssessmentPage() {
  await requirePermission("create_tax_disputes")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Sengketa Pajak", href: "/keuangan/sengketa-pajak" },
          { label: "Daftarkan" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Daftarkan Ketetapan Pajak</h1>
      <TaxAssessmentForm />
    </div>
  )
}
