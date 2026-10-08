import { MAX_LIST_ROWS } from "@/lib/constants/list-rows";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Wrench } from "lucide-react"
import { VehicleFitmentTable } from "./_components/vehicle-fitment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Fitment Kendaraan" }

export default async function VehicleFitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; hasil?: string }>
}) {
  await requirePermission("view_vehicle_fitments")

  const params = await searchParams

  const rules = await prisma.vehicleFitmentRule.findMany({
    where: {
      ...(params.cari && {
        OR: [
          { source: { contains: params.cari } },
          { notes: { contains: params.cari } },
        ],
      }),
      ...(params.hasil && { result: params.hasil }),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_LIST_ROWS,
  })

  // Resolve display names for the scoped catalog references.
  const itemIds = [...new Set(rules.map((r) => r.itemId))]
  const brandIds = [...new Set(rules.map((r) => r.vehicleBrandId).filter((x): x is number => x != null))]
  const modelIds = [...new Set(rules.map((r) => r.vehicleModelId).filter((x): x is number => x != null))]
  const variantIds = [...new Set(rules.map((r) => r.vehicleVariantId).filter((x): x is number => x != null))]

  const [items, brands, models, variants] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, sku: true, name: true } }),
    prisma.vehicleBrand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }),
    prisma.vehicleModel.findMany({ where: { id: { in: modelIds } }, select: { id: true, name: true } }),
    prisma.vehicleVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true } }),
  ])

  const itemMap = new Map(items.map((i) => [i.id, i]))
  const brandMap = new Map(brands.map((b) => [b.id, b.name]))
  const modelMap = new Map(models.map((m) => [m.id, m.name]))
  const variantMap = new Map(variants.map((v) => [v.id, v.name]))

  const tableData = toPlain(
    rules.map((r) => ({
      ...r,
      itemSku: itemMap.get(r.itemId)?.sku ?? null,
      itemName: itemMap.get(r.itemId)?.name ?? `Item #${r.itemId}`,
      brandName: r.vehicleBrandId != null ? brandMap.get(r.vehicleBrandId) ?? null : null,
      modelName: r.vehicleModelId != null ? modelMap.get(r.vehicleModelId) ?? null : null,
      variantName: r.vehicleVariantId != null ? variantMap.get(r.vehicleVariantId) ?? null : null,
    })),
  )

  const filters = ["", "compatible", "incompatible", "unknown"]

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Kendaraan", href: "/kendaraan" },
        { label: "Fitment" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Aturan Fitment Kendaraan</h1>
        <CanCreate permission="create_vehicle_fitments">
          <Link href="/kendaraan/fitment/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-fitment-btn">
            <Wrench size={16} /> Tambah Aturan
          </Link>
        </CanCreate>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {filters.map((f) => (
          <Link
            key={f || "all"}
            href={`/kendaraan/fitment${f ? `?hasil=${f}` : ""}`}
            className={`filter-chip ${(params.hasil ?? "") === f ? "active" : ""}`}
          >
            {f === "" ? "Semua" : f === "compatible" ? "Cocok" : f === "incompatible" ? "Tidak Cocok" : "Belum Diketahui"}
          </Link>
        ))}
      </div>

      <VehicleFitmentTable data={tableData} />
    </div>
  )
}
