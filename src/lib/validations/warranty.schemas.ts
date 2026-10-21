import { z } from "zod";

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
