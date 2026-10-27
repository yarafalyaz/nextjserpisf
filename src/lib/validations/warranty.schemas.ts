import { z } from "zod";
import "./zod-locale";

// F-2026-10-21-021 tahap 2 — klaim garansi. State machine + keputusan manual
// hidup di warranty.service.ts; schema ini hanya gerbang bentuk FormData.

const optionalInt = (label: string) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().min(0, `${label} tidak valid`).optional(),
  );

export const createWarrantyClaimSchema = z.object({
  coverageId: z.coerce.number().int().positive("Cakupan garansi wajib dipilih"),
  // Tanggal lapor (YYYY-MM-DD, WIB di-resolve pemanggil) — kosong = hari ini.
  reportedAt: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.date().optional(),
  ),
  odometerKm: optionalInt("Odometer"),
  complaint: z.string().trim().min(1, "Keluhan klaim garansi wajib diisi").max(5000),
});

export const decideWarrantyClaimSchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  decision: z.enum(["approved", "rejected"]),
  resolutionType: z.enum(["repair", "replace", "reject"]),
  decisionNotes: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().trim().max(5000).optional(),
  ),
});

export const transitionWarrantyClaimSchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  // approved/rejected SENGAJA tidak ada di sini: keputusan wajib lewat
  // decideWarrantyClaimSchema supaya pejabat + alasan selalu tercatat.
  to: z.enum(["eligibility", "in_repair", "closed"]),
  repairWorkOrderId: optionalInt("Work order perbaikan"),
});

// F-2026-10-21-022 — tautan klaim supplier. Bentuk FormData saja; guard
// vendor/item/serial/bukti hidup di warranty.service.ts.
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const linkSupplierClaimSchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  supplierClaimVendorId: z.coerce.number().int().positive("Vendor klaim supplier wajib dipilih"),
  // Kosong = jalur vendor-saja tanpa PO asal (retur tidak bisa lahir).
  purchaseReturnId: optionalInt("Retur pembelian"),
  supplierClaimRefNo: optionalText(191),
  supplierClaimNotes: optionalText(5000),
});

export const transitionSupplierClaimSchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  to: z.enum([
    "drafted",
    "sent",
    "accepted",
    "rejected_supplier",
    "returned",
    "closed_recovered",
    "closed_no_recovery",
    "none",
  ]),
  supplierClaimRefNo: optionalText(191),
  supplierClaimNotes: optionalText(5000),
});

// F-2026-10-21-021 tahap 3 rute MATI — pemanggil jurnal E2/E3. Bentuk saja;
// syarat status/mapping/periode/anti-dobel hidup di warranty-journal.service.
const eventDate = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.date().optional(),
);

export const postWarrantyClaimCostSchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  eventDate,
});

export const postWarrantySupplierRecoverySchema = z.object({
  claimId: z.coerce.number().int().positive("Klaim garansi wajib dipilih"),
  amount: z.coerce.number().positive("Nominal recovery harus lebih dari nol"),
  eventDate,
});

// F-2026-10-22-072-S — catat lepas part terpasang. Alasan wajib; guard
// qty/serial/pengganti hidup di installed-part.service.ts. Tidak ada
// schema edit/hapus baris registri (BR-IP-01/AC-IP-8).
export const recordInstalledPartRemovalSchema = z.object({
  installedPartId: z.coerce.number().int().positive("Part terpasang wajib dipilih"),
  qtyRemoved: z.coerce.number().positive("Jumlah part dilepas wajib lebih dari nol"),
  removalReason: z.string().trim().min(1, "Alasan pencatatan lepas part wajib diisi").max(5000),
  replacedByInstalledPartId: optionalInt("Part pengganti"),
});
