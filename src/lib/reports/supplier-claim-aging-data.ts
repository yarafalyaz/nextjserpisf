/**
 * Loader read-only daftar aging klaim supplier terbuka
 * (F-2026-10-24-095-S §5 BR-SUPP-11, induk F-2026-10-21-022).
 *
 * Satu query massal WarrantyClaim berstatus supplier terbuka
 * (drafted/sent/accepted/rejected_supplier/returned) beserta vendor,
 * retur pembelian, cakupan+item, kendaraan+pelanggan lewat relasi
 * Prisma — tanpa N+1, tanpa mutasi, tanpa jurnal. Populasi, umur, dan
 * ember di builder murni `supplier-claim-aging.ts`. Telepon pelanggan
 * TIDAK PERNAH dipilih: daftar ini untuk tindak lanjut distributor/
 * vendor, bukan menghubungi pelanggan.
 *
 * Izin ditegakkan permukaan pemanggil (halaman laporan `view_reports`
 * atau halaman klaim `view_warranty_claims`, putusan BOT 1 saat UI
 * dibuka) — loader hanya membaca.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildSupplierClaimAging,
  SUPPLIER_CLAIM_OPEN_STATUSES,
  type SupplierClaimAging,
} from "@/lib/reports/supplier-claim-aging"

export async function getSupplierClaimAging(now: Date = new Date()): Promise<SupplierClaimAging> {
  const claims = await prisma.warrantyClaim.findMany({
    where: { supplierClaimStatus: { in: [...SUPPLIER_CLAIM_OPEN_STATUSES] } },
    select: {
      id: true,
      status: true,
      reportedAt: true,
      supplierClaimStatus: true,
      supplierClaimVendorId: true,
      supplierClaimRefNo: true,
      supplierClaimAt: true,
      purchaseReturnId: true,
      supplierClaimVendor: { select: { id: true, name: true } },
      purchaseReturn: { select: { id: true, documentNo: true, status: true } },
      coverage: {
        select: {
          id: true,
          serialNumber: true,
          itemId: true,
          item: { select: { name: true, sku: true } },
        },
      },
      customerVehicle: {
        select: {
          id: true,
          plateNumber: true,
          customer: { select: { id: true, name: true } },
          vehicle: { select: { name: true } },
        },
      },
    },
    orderBy: [{ supplierClaimAt: "asc" }, { id: "asc" }],
  })

  return buildSupplierClaimAging(
    claims.map((claim) => ({
      claimId: claim.id,
      claimStatus: claim.status,
      supplierClaimStatus: claim.supplierClaimStatus,
      supplierClaimAt: claim.supplierClaimAt,
      supplierClaimRefNo: claim.supplierClaimRefNo,
      vendorId: claim.supplierClaimVendor?.id ?? claim.supplierClaimVendorId,
      vendorName: claim.supplierClaimVendor?.name ?? null,
      purchaseReturnId: claim.purchaseReturn?.id ?? claim.purchaseReturnId,
      purchaseReturnDocumentNo: claim.purchaseReturn?.documentNo ?? null,
      purchaseReturnStatus: claim.purchaseReturn?.status ?? null,
      coverageId: claim.coverage.id,
      itemId: claim.coverage.itemId,
      itemName: claim.coverage.item.name,
      itemSku: claim.coverage.item.sku,
      serialNumber: claim.coverage.serialNumber,
      customerId: claim.customerVehicle.customer.id,
      customerName: claim.customerVehicle.customer.name,
      customerVehicleId: claim.customerVehicle.id,
      plateNumber: claim.customerVehicle.plateNumber,
      vehicleName: claim.customerVehicle.vehicle.name,
      reportedAt: claim.reportedAt,
    })),
    { now },
  )
}
