export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { JournalForm } from "@/components/forms/journal-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Jurnal" }

export default async function CreateJournalPage() {
  await requirePermission("create_journals")

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  })

  // Master pusat laba untuk pilihan di form; tanpa daftar ini jurnal tidak bisa
  // ditandai pusat laba, sehingga laporan pusat laba selalu kosong.
  const costCenters = await prisma.costCenter.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })
  const profitCenters = await prisma.profitCenter.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Entri Jurnal</h1>
      </div>
      <JournalForm accounts={accounts} profitCenters={profitCenters} costCenters={costCenters} />
    </div>
  )
}
