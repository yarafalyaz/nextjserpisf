export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { EditBankForm } from "./form"
import { EditPageShell } from "@/components/ui/edit-page-shell"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { resolveEntity } from "@/lib/utils/resolve-entity"
export const metadata: Metadata = { title: "Ubah Bank" }

export default async function EditBankPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_banks")

  const { slug } = await params

  const bank = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.bank.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.bank.findUnique({ where: { id } }),
    },
  )

  if (!bank) notFound()

  return (
    <EditPageShell
      breadcrumbs={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Bank", href: "/master/bank" },
        { label: "Ubah" },
      ]}
      title={`Ubah Bank: ${bank.name}`}
    >
      <EditBankForm bank={bank} />
    </EditPageShell>
  )
}
