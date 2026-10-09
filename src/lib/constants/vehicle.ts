/**
 * Canonical vehicle drivetrain + transmission enumeration.
 *
 * VEH-07 fitment matching is a case-insensitive EXACT-string comparison
 * (`vehicle-fitment.service.ts` `norm()`), so the values typed into a variant,
 * a fitment rule, and the ad-hoc fitment checker must all come from the same
 * vocabulary. Before this module the variant manager offered `4x2/4x4/AWD` and
 * `AT/MT/CVT` while the fitment checker and rule form were free-text fields
 * hinting `4WD`/`Manual` — a `4x4` query would never match a `4WD` rule.
 *
 * Keep this the single source of truth for both the pickers and any validation.
 */

export interface VehicleEnumOption {
  value: string
  label: string
}

/** Drivetrain / penggerak. `value` is what is stored and matched. */
export const DRIVETRAIN_OPTIONS: VehicleEnumOption[] = [
  { value: "4x2", label: "4x2" },
  { value: "4x4", label: "4x4" },
  { value: "AWD", label: "AWD" },
  { value: "FWD", label: "FWD" },
  { value: "RWD", label: "RWD" },
]

/** Transmission / transmisi. `value` is what is stored and matched. */
export const TRANSMISSION_OPTIONS: VehicleEnumOption[] = [
  { value: "MT", label: "MT (Manual)" },
  { value: "AT", label: "AT (Otomatis)" },
  { value: "CVT", label: "CVT" },
  { value: "DCT", label: "DCT" },
]

export const DRIVETRAIN_VALUES = DRIVETRAIN_OPTIONS.map((o) => o.value)
export const TRANSMISSION_VALUES = TRANSMISSION_OPTIONS.map((o) => o.value)
