export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { listWarrantyCoveragesByVehicle } from "@/actions/warranty.actions"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { formatDate } from "@/lib/utils/format"
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
  const vehicleId = params.kendaraan ? Number(params.kendaraan) : Number.NaN

  let coverageOptions: WarrantyCoverageOption[] = []
  let vehicleLabel: string | null = null
  if (Number.isInteger(vehicleId) && vehicleId > 0) {
    const result = await listWarrantyCoveragesByVehicle(vehicleId)
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
    const vehicle = await prisma.customerVehicle.findUnique({
      where: { id: vehicleId },
      select: { plateNumber: true },
    })
    vehicleLabel = vehicle?.plateNumber ?? `Kendaraan #${vehicleId}`
  }

  const vehicles = await prisma.customerVehicle.findMany({
    where: { isActive: true },
    orderBy: { plateNumber: "asc" },
    take: 200,
    select: { id: true, plateNumber: true },
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
            <ul className="mt-4 flex flex-col divide-y divide-default">
              {vehicles.map((v) => (
                <li key={v.id} className="py-3">
                  <a
                    href={`/produksi/garansi/tambah?kendaraan=${v.id}`}
                    className="font-mono text-sm text-primary hover:underline"
                    aria-label={`Pilih kendaraan ${v.plateNumber ?? v.id} untuk klaim garansi`}
                  >
                    {v.plateNumber ?? `Kendaraan #${v.id}`}
                  </a>
                </li>
              ))}
            </ul>
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
