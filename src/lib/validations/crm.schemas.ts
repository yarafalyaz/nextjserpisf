import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalId = z.coerce.number().min(1).optional()

// ==================== TICKET ====================

export const createTicketSchema = z.object({
  subject: z.string().min(1, "Subjek wajib diisi").max(255),
  description: optionalString(2000),
  customerId: optionalId,
  customerName: optionalString(255),
  customerEmail: optionalString(255),
  customerPhone: optionalString(50),
  type: optionalString(100),
  priority: optionalString(50),
  assignedTo: optionalId,
})

export const updateTicketSchema = z.object({
  subject: z.string().min(1, "Subjek wajib diisi").max(255),
  description: optionalString(2000),
  customerId: optionalId,
  customerName: optionalString(255),
  customerEmail: optionalString(255),
  customerPhone: optionalString(50),
  type: optionalString(100),
  priority: optionalString(50),
  assignedTo: optionalId,
  resolutionNotes: optionalString(2000),
})
