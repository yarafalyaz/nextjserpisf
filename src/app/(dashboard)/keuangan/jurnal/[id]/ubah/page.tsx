export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { JournalForm } from "@/components/forms/journal-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Jurnal" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_journals")

  const { id } = await params

  const data = await prisma.journal.findUnique({
    where: { id: Number(id) },
    include: { entries: { orderBy: { id: "asc" } } },
  })

  if (!data) notFound()

  const journal = {
    id: data.id,
    date: data.transactionDate.toISOString().split("T")[0],
    description: data.description,
    type: data.type,
    entries: data.entries.map((e) => ({
      accountId: e.accountId,
      debit: Number(e.debit),
      credit: Number(e.credit),
      memo: e.memo ?? "",
    })),
  }

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan/jurnal" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <JournalForm journal={journal} accounts={accounts}/>
    </div>
  )
}
