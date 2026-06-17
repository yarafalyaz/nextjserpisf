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
  // Status round-trip: the edit form exposes a Status select so a support
  // agent can mark a ticket as resolved/closed. Without this field the form
  // posts the value, Zod strips it, and the action's data block never
  // writes it — the ticket stays 'open' forever.
  status: z
    .enum(["open", "in_progress", "resolved", "closed"], {
      message: "Status harus salah satu dari open, in_progress, resolved, closed",
    })
    .optional(),
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

// Lead status lifecycle (mirrors YaraERP). Only qualified+ may be converted.
export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;
export const CONVERTIBLE_STATUSES = [
  "qualified",
  "proposal",
  "negotiation",
  "won",
] as const;

// updateLead additionally accepts a status (createLead always seeds "new"),
// so the action can drive the lifecycle + log status_change activities.
export const updateLeadSchema = createLeadSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
});

export const leadActivitySchema = z.object({
  type: z.enum(["note", "call", "email", "meeting", "task"]),
  subject: z.string().min(1, "Subjek wajib diisi").max(255),
  description: optionalString(2000),
  scheduledAt: z.coerce.date().optional(),
});
