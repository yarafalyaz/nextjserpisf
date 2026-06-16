import { z } from "zod";

const optionalString = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

const optionalId = z.coerce.number().int().min(1).optional();

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
});

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
});

// ==================== LEAD ====================

// Server-side variant validating the FormData posted to createLead/updateLead.
// The Lead model maps `name`, `notes`, `address` to Postgres `text` (no DB-level
// length cap) and `estimatedValue` to Decimal(15,2), so without this schema an
// authenticated user could post a negative estimatedValue (corrupting CRM
// pipeline forecasts), an unparseable expectedCloseDate (→ Invalid Date crashes
// prisma with an opaque 500), or unbounded strings. Mirrors the validation the
// other master/CRM actions already enforce via parseFormData.
const optionalNonNegative = () =>
  z.coerce.number().min(0, "Nilai tidak boleh negatif").nullable().optional();

export const createLeadSchema = z.object({
  name: z.string().min(1, "Nama wajib diisi").max(255),
  email: optionalString(255),
  phone: optionalString(50),
  company: optionalString(255),
  contactName: optionalString(255),
  position: optionalString(255),
  industry: optionalString(255),
  estimatedValue: optionalNonNegative(),
  expectedCloseDate: z.coerce.date().optional(),
  address: optionalString(1000),
  source: optionalString(255),
  notes: optionalString(2000),
  assignedTo: optionalId,
});

export const updateLeadSchema = createLeadSchema;
