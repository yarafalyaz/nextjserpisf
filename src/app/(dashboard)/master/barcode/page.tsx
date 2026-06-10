export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { BarcodeTable } from "./_components/barcode-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Barcode" }

export default async function BarcodesPage() {
  const barcodes = await prisma.barcode.findMany({
    orderBy: { createdAt: "desc" },
    include: { item: { select: { name: true } } },
    take: 1000,
  })

  const tableData = JSON.parse(JSON.stringify(barcodes))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Barcode" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Barcode</h1>
        <Link href="/master/barcode/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-barcode-btn">
          + Tambah Barcode
        </Link>
      </div>

      <BarcodeTable data={tableData} />
    </div>
  )
}
