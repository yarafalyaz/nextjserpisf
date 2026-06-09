export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { SalesOrderForm } from "@/components/forms/sales-order-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pesanan" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.salesOrder.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Penjualan", href: "/penjualan/pesanan" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <SalesOrderForm order={{ id: data.id, customerId: data.customerId, date: data.date.toISOString().split('T')[0], notes: data.notes }} customers={customers}/>
    </div>
  )
}
