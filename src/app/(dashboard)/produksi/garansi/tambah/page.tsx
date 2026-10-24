export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { listWarrantyCoveragesByVehicle } from "@/actions/warranty.actions"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { WarrantyClaimForm, type WarrantyCoverageOption } from "../_components/warranty-claim-form"

export const metadata: Metadata = { title: "Buat Klaim Garansi" }

/**
 * Intake klaim garansi baru (F-2026-10-21-021 tahap UI).
 *
 * Opsi cakupan dibaca dari cakupan garansi kendaraan lewat action
 * existing `listWarrantyCoveragesByVehicle` (izin view) per kendaraan
 * yang dipilih lewat parameter `kendaraan`; tanpa parameter itu daftar
 * kendaraan aktif ditautkan. Submit memanggil `createWarrantyClaimAction`
 * (izin create_warranty_claims ditegakkan server + gerbang halaman ini).
 * serialKey kosong tidak pernah ditampilkan sebagai nomor serial.
 */
export default async function WarrantyClaimCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ kendaraan?: string }>
}) {
  await requirePermission("create_warranty_claims")
  const params = await searchParams
  const vehicleSegment = params.kendaraan?.trim() || null

  let coverageOptions: WarrantyCoverageOption[] = []
  let vehicleLabel: string | null = null
  if (vehicleSegment) {
    const vehicle = await resolveEntity(
      { segment: vehicleSegment, fallbackWhere: { isActive: true } },
      {
        bySlug: (s, where) =>
          prisma.customerVehicle.findFirst({
            where: { slug: s, ...where },
            select: {
              id: true,
              plateNumber: true,
              color: true,
              customer: { select: { name: true } },
              vehicle: {
                select: {
                  year: true,
                  variant: { select: { name: true, model: { select: { name: true, brand: { select: { name: true } } } } } },
                },
              },
            },
          }),
        byId: (id, where) =>
          prisma.customerVehicle.findFirst({
            where: { id, ...where },
            select: {
              id: true,
              plateNumber: true,
              color: true,
              customer: { select: { name: true } },
              vehicle: {
                select: {
                  year: true,
                  variant: { select: { name: true, model: { select: { name: true, brand: { select: { name: true } } } } } },
                },
              },
            },
          }),
      },
    )
    if (vehicle) {
      const result = await listWarrantyCoveragesByVehicle(vehicle.id)
      if (result.success && result.coverages) {
        coverageOptions = result.coverages.map((c) => {
          const serial = c.serialNumber?.trim()
            ? `Seri ${c.serialNumber}`
            : "Belum ada nomor serial tercatat"
          return {
            value: String(c.id),
            label: `${c.item.name} — ${serial} — berakhir ${formatDate(c.expiresAt)}`,
          }
        })
      }
      const brand = vehicle.vehicle?.variant?.model?.brand?.name
      const model = vehicle.vehicle?.variant?.model?.name
      const variant = vehicle.vehicle?.variant?.name
      const unit = [brand, model, variant ? `(${variant})` : null].filter(Boolean).join(" ")
      vehicleLabel = [vehicle.plateNumber ?? "Tanpa pelat", unit || null, vehicle.customer?.name ? `— ${vehicle.customer.name}` : null]
        .filter(Boolean)
        .join(" ")
    }
  }

  const vehicles = await prisma.customerVehicle.findMany({
    where: { isActive: true },
    orderBy: { plateNumber: "asc" },
    take: 200,
    select: {
      id: true,
      slug: true,
      plateNumber: true,
      color: true,
      customer: { select: { name: true } },
      vehicle: {
        select: {
          year: true,
          variant: { select: { name: true, model: { select: { name: true, brand: { select: { name: true } } } } } },
        },
      },
      _count: { select: { warrantyCoverages: true } },
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Klaim Garansi", href: "/produksi/garansi" },
          { label: "Buat Klaim" },
        ]}
      />
      <h1 className="text-2xl font-bold text-foreground">Buat Klaim Garansi</h1>

      {vehicleLabel === null ? (
        <section
          aria-label="Pilih kendaraan untuk klaim garansi"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Pilih Kendaraan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cakupan garansi dibaca per kendaraan. Pilih kendaraan untuk melihat cakupannya.
          </p>
          {vehicles.length === 0 ? (
            <p className="mt-4 text-muted-foreground">Belum ada kendaraan aktif tercatat.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm" aria-label="Daftar kendaraan aktif">
                <thead>
                  <tr className="border-b border-default text-left">
                    <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">Plat Nomor</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">Unit</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">Pelanggan</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">Cakupan</th>
                    <th scope="col" className="px-4 py-2.5 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {vehicles.map((v) => {
                    const brand = v.vehicle?.variant?.model?.brand?.name
                    const model = v.vehicle?.variant?.model?.name
                    const variant = v.vehicle?.variant?.name
                    const unit = [brand, model, variant ? `(${variant})` : null].filter(Boolean).join(" ") || "-"
                    return (
                      <tr key={v.id}>
                        <td className="px-4 py-2.5 font-mono text-foreground">{v.plateNumber ?? "-"}</td>
                        <td className="px-4 py-2.5 text-foreground">{unit}</td>
                        <td className="px-4 py-2.5 text-foreground">{v.customer?.name ?? "-"}</td>
                        <td className="px-4 py-2.5">
                          <StatusChip
                            status={v._count.warrantyCoverages > 0 ? "active" : "closed"}
                            customLabel={
                              v._count.warrantyCoverages > 0
                                ? `${v._count.warrantyCoverages} cakupan`
                                : "Tanpa cakupan"
                            }
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <a
                            href={`/produksi/garansi/tambah?kendaraan=${v.slug ?? v.id}`}
                            className="font-medium text-primary hover:underline"
                            aria-label={`Pilih kendaraan ${v.plateNumber ?? unit} untuk klaim garansi`}
                          >
                            Pilih
                          </a>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : coverageOptions.length === 0 ? (
        <section
          aria-label="Cakupan garansi kendaraan"
          className="bg-surface rounded-xl border border-default shadow-sm p-6"
        >
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Kendaraan {vehicleLabel}
          </h2>
          <p className="mt-2 text-muted-foreground">
            Kendaraan ini belum memiliki cakupan garansi tercatat, jadi klaim belum dapat dibuat.
          </p>
        </section>
      ) : (
        <WarrantyClaimForm coverages={coverageOptions} />
      )}
    </div>
  )
}
