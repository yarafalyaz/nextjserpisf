export const dynamic = "force-dynamic"

import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { UomForm } from "./form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Satuan" }

export default function CreateUomPage() {
  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Data Master", href: "/master" },
        { label: "Satuan", href: "/master/satuan" },
        { label: "Buat" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Satuan</h1>
      </div>
      <UomForm />
    </div>
  )
}
