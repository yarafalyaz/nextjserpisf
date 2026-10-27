import { z } from "zod";
import "./zod-locale";

const optionalNumber = () =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  );

const optionalString = (max = 255) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().max(max).optional(),
  );

// Vehicle year: bounded both sides, mirroring vehicle.schemas yearField.
// Fitment rules stored 99999/1 and then matched no real vehicle year.
const yearBound = () =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce
      .number()
      .int()
      .min(1900, "Tahun tidak valid")
      .max(new Date().getFullYear() + 1, "Tahun tidak valid")
      .optional(),
  );

// ==================== VEHICLE FITMENT RULE ====================
// VEH-07 — scopes an item (and optionally a BOM revision) to a vehicle
// configuration and declares compatible / incompatible / unknown.

export const vehicleFitmentResultEnum = z.enum([
  "compatible",
  "incompatible",
  "unknown",
]);

export const createVehicleFitmentSchema = z.object({
  itemId: z.coerce.number().int().positive("Item wajib dipilih"),
  bomRevisionId: optionalNumber(),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  vehicleVariantId: optionalNumber(),
  yearFrom: yearBound(),
  yearTo: yearBound(),
  drivetrain: optionalString(100),
  transmission: optionalString(100),
  result: vehicleFitmentResultEnum.default("unknown"),
  source: optionalString(2000),
  notes: optionalString(2000),
});

export const updateVehicleFitmentSchema = createVehicleFitmentSchema.extend({
  // Form selalu mengirim eksplisit "true"/"false" (parseFormData mengubahnya
  // jadi boolean). Absen = pemanggil non-form: biarkan tak berubah.
  isActive: z
    .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === "true" || v === "on")),
});

export const checkFitmentConflictSchema = z.object({
  itemId: z.coerce.number().int().positive("Item wajib dipilih"),
  // Rule being edited; excluded from its own conflict list.
  excludeRuleId: optionalNumber(),
  bomRevisionId: optionalNumber(),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  vehicleVariantId: optionalNumber(),
  yearFrom: yearBound(),
  yearTo: yearBound(),
  drivetrain: optionalString(100),
  transmission: optionalString(100),
  result: vehicleFitmentResultEnum,
});

export const checkFitmentSchema = z.object({
  productId: optionalNumber(),
  itemId: optionalNumber(),
  bomRevisionId: optionalNumber(),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  vehicleVariantId: optionalNumber(),
  year: yearBound(),
  drivetrain: optionalString(100),
  transmission: optionalString(100),
});

