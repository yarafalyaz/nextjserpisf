/* eslint-disable @typescript-eslint/no-explicit-any */
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { VendorPaymentForm } from "@/components/forms/vendor-payment-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.vendorPayment.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const [vendors, bills] = await Promise.all([prisma.vendor.findMany({ orderBy: { name: "asc" } }), prisma.vendorBill.findMany({ where: { status: { not: "paid" } }, orderBy: { createdAt: "desc" } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "purchase", href: "/pembelian/pembayaran-vendor" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <VendorPaymentForm payment={data as any} vendors={vendors as any} bills={bills as any}/>
    </div>
  )
}
