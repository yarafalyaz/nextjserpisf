import { z } from "zod";

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
  yearFrom: optionalNumber(),
  yearTo: optionalNumber(),
  drivetrain: optionalString(100),
  transmission: optionalString(100),
  result: vehicleFitmentResultEnum.default("unknown"),
  source: optionalString(2000),
  notes: optionalString(2000),
});

export const updateVehicleFitmentSchema = createVehicleFitmentSchema.extend({
  isActive: z
    .preprocess((v) => v === "on" || v === "true" || v === true, z.boolean())
    .optional(),
});

export const checkFitmentSchema = z.object({
  productId: optionalNumber(),
  itemId: optionalNumber(),
  bomRevisionId: optionalNumber(),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  vehicleVariantId: optionalNumber(),
  year: optionalNumber(),
  drivetrain: optionalString(100),
  transmission: optionalString(100),
});

export type CreateVehicleFitmentInput = z.infer<typeof createVehicleFitmentSchema>;
export type UpdateVehicleFitmentInput = z.infer<typeof updateVehicleFitmentSchema>;
export type CheckFitmentInput = z.infer<typeof checkFitmentSchema>;
