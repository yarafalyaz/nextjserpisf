import { z } from "zod"

/**
 * Schema for self-service check-in / check-out.
 * Latitude and longitude are optional (client may not have GPS).
 */
export const selfAttendanceLocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
})

export type SelfAttendanceLocationInput = z.infer<typeof selfAttendanceLocationSchema>
