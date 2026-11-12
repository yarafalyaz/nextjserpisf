import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"

export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { Wrench, Plus, CheckCircle2, XCircle, AlertTriangle } from "@/components/ui/fontawesome-icons"
import { VehicleFitmentTable } from "./_components/vehicle-fitment-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Kompatibilitas Kendaraan" }

export default async function VehicleFitmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; hasil?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_vehicle_fitments")

  const params = await searchParams
  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { source: { contains: params.cari } },
        { notes: { contains: params.cari } },
      ],
    }),
    ...(params.hasil && { result: params.hasil }),
  }

  const [rules, total, resultGroups] = await Promise.all([
    prisma.vehicleFitmentRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.vehicleFitmentRule.count({ where }),
    prisma.vehicleFitmentRule.groupBy({
      by: ["result"],
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: resultGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    compatible: 0,
    incompatible: 0,
    unknown: 0,
  }
  for (const group of resultGroups) {
    if (group.result in counts) {
      counts[group.result] = group._count?.id ?? 0
    }
  }

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
      itemName: itemMap.get(r.itemId)?.name ?? `Barang #${r.itemId}`,
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
        { label: "Kompatibilitas" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Aturan Kompatibilitas Kendaraan (Fitment Rules)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pemetaan kecocokan suku cadang dan sparepart terhadap varian merek, model, tahun, serta transmisi armada kendaraan.
          </p>
        </div>
        <CanCreate permission="create_vehicle_fitments">
          <Link
            href="/kendaraan/fitment/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-fitment-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Tambah Aturan</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Aturan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Wrench className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh aturan part terpasang</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Cocok (Compatible)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.compatible}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Tervalidasi sesuai spesifikasi</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Tidak Cocok (Incompatible)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-destructive font-mono tabular-nums">
              {counts.incompatible}
            </span>
            <XCircle className="size-4 text-destructive/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Dilarang dipasang pada unit</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Belum Diketahui
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.unknown}
            </span>
            <AlertTriangle className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Butuh verifikasi teknis fisik</span>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {filters.map((f) => {
          const isActive = (params.hasil ?? "") === f
          const count = f === "" ? counts.all : (counts[f] ?? 0)
          const label = f === "" ? "Semua" : f === "compatible" ? "Cocok" : f === "incompatible" ? "Tidak Cocok" : "Belum Diketahui"

          return (
            <Link
              key={f || "all"}
              href={withListParams("/kendaraan/fitment", params, { hasil: f || undefined, halaman: undefined })}
              className={`filter-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{label}</span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
                  isActive
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      <VehicleFitmentTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
