export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { isNumericId } from "@/lib/utils/entity-url"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { WithholdingTaxTypeForm } from "@/components/forms/withholding-tax-type-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Jenis PPh" }

export default async function EditWithholdingTaxTypePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("manage_withholding_tax")

  const { slug } = await params
  const taxType = isNumericId(slug)
    ? await prisma.withholdingTaxType.findUnique({ where: { id: Number(slug) } })
    : await prisma.withholdingTaxType.findFirst({ where: { slug } })

  if (!taxType) notFound()

  const accounts = await loadPostableAccounts({
    includeIds: [taxType.liabilityAccountId, taxType.receivableAccountId],
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Jenis PPh", href: "/pengaturan/pajak-potong" },
        { label: taxType.name },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Ubah Jenis Pemotongan PPh</h1>
      <WithholdingTaxTypeForm
        accounts={accounts}
        taxType={{
          id: taxType.id,
          code: taxType.code,
          name: taxType.name,
          rate: Number(taxType.rate),
          article: taxType.article,
          objectCode: taxType.objectCode,
          liabilityAccountId: taxType.liabilityAccountId,
          receivableAccountId: taxType.receivableAccountId,
          isActive: taxType.isActive,
        }}
      />
    </div>
  )
}
