import { Info } from "lucide-react"
export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function UomPage() {
  const items = await prisma.item.findMany({
    where: { deletedAt: null },
    select: { unitOfMeasure: true },
    distinct: ["unitOfMeasure"],
    orderBy: { unitOfMeasure: "asc" },
  })

  const uomList = items.map((i) => i.unitOfMeasure)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "UoM" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Satuan (Unit of Measure)</h1>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="flex items-center gap-2" style={{ marginBottom: "1rem", color: "var(--text-secondary)" }}>
          <Info size={16} />
          <span>Satuan dikelola sebagai field teks pada data barang. Berikut daftar satuan yang digunakan saat ini:</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>ID</th>
                <th>Kode</th>
                <th>Nama</th>
              </tr>
            </thead>
            <tbody>
              {uomList.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-10 px-4 text-muted">Belum ada satuan yang digunakan</td>
                </tr>
              ) : (
                uomList.map((uom, idx) => (
                  <tr key={uom}>
                    <td>{idx + 1}</td>
                    <td className="font-mono">{uom}</td>
                    <td className="font-medium">{uom}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
