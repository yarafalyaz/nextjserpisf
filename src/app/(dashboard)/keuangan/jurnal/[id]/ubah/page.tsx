export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { JournalForm } from "@/components/forms/journal-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Jurnal" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.journal.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const journal = {
    id: data.id,
    date: data.transactionDate.toISOString().split("T")[0],
    description: data.description,
  }

  const accounts = await prisma.account.findMany({ orderBy: { code: "asc" } })

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
