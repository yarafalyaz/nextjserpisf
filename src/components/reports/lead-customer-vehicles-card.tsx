import Link from "next/link"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-20-93(a): kendaraan pelanggan tertaut yang tampil di detail lead.
 *
 * Data read-only dari `prisma.customerVehicle` milik pelanggan lead
 * (`lead.customerId`), dibentuk halaman induk. Komponen murni presentasi:
 * tiap baris tautan ke detail kendaraan itu
 * (`/master/pelanggan/<pelanggan>/kendaraan/<kendaraan>`), yang sudah memuat
 * linimasa + riwayat WO/penawaran/faktur kendaraan bersangkutan.
 * Inti F-93 dinyatakan ditunda-teknis (PUTUSAN manager 20:24); tidak ada
 * keputusan pembelian/penjualan ulang di sini.
 */
export interface LeadCustomerVehicleRow {
  id: number
  slug?: string | null
  plateNumber: string | null
  vehicleName: string | null
  color: string | null
  year: number | null
  isActive: boolean
}

export function LeadCustomerVehiclesCard({
  customerSlug,
  customerId,
  customerName,
  vehicles,
}: Readonly<{
  customerSlug: string | null
  customerId: number
  customerName: string
  vehicles: LeadCustomerVehicleRow[]
}>) {
  const customerKey = customerSlug && customerSlug.length > 0 ? customerSlug : String(customerId)
  return (
    <ReportCardShell
      label="Kendaraan Pelanggan"
      title="Kendaraan Pelanggan"
      summary={
        <>
          {vehicles.length} kendaraan · {customerName}
        </>
      }
      isEmpty={vehicles.length === 0}
      emptyText="Belum ada kendaraan terdaftar untuk pelanggan ini"
    >
      <ul className="flex flex-col divide-y divide-default">
        {vehicles.map((vehicle) => {
          const vehicleKey =
            vehicle.slug && vehicle.slug.length > 0 ? vehicle.slug : String(vehicle.id)
          const label = vehicle.vehicleName ?? "Kendaraan tanpa nama"
          return (
            <li
              key={vehicle.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/master/pelanggan/${customerKey}/kendaraan/${vehicleKey}`}
                  className="font-medium text-primary hover:underline"
                >
                  {label}
                </Link>
                <span className="font-mono text-sm text-muted-foreground">
                  {vehicle.plateNumber ?? "—"}
                </span>
                {vehicle.year ? (
                  <span className="text-sm text-muted-foreground">{vehicle.year}</span>
                ) : null}
                {vehicle.color ? (
                  <span className="text-sm text-muted-foreground">{vehicle.color}</span>
                ) : null}
              </span>
              <span className="text-sm text-muted-foreground">
                {vehicle.isActive ? "Aktif" : "Nonaktif"}
              </span>
            </li>
          )
        })}
      </ul>
    </ReportCardShell>
  )
}
