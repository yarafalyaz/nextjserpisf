/**
 * Database-backed slug generation.
 *
 * Actions call `nextSlug(model, base, opts)` to obtain a unique, human-readable
 * slug for a row before create/update. The helper knows how to reach each
 * Prisma model delegate's `findFirst`, so actions only pass a logical model
 * name (the Prisma model key, lowerCamelCase) plus the source text.
 *
 * A `slug` column exists only on routed models (migration
 * `20261011100000_add_slug_columns`; backfill lewat `src/lib/setup/slug-backfill.ts`).
 * For models without one, `nextSlug` returns `null` and callers should omit it.
 */
import { prisma } from "@/lib/db/prisma"
import { buildUniqueSlug } from "@/lib/utils/slug"

/** Delegates that expose `slug`. */
const SLUGGED_MODELS = {
  account: "account",
  bank: "bank",
  barcode: "barcode",
  department: "department",
  warehouse: "warehouse",
  position: "position",
  employee: "employee",
  jobVacancy: "jobVacancy",
  jobApplicant: "jobApplicant",
  performanceCycle: "performanceCycle",
  performanceReview: "performanceReview",
  competency: "competency",
  training: "training",
  item: "item",
  itemCategory: "itemCategory",
  itemGroup: "itemGroup",
  customerCategory: "customerCategory",
  expenseCategory: "expenseCategory",
  taxGroup: "taxGroup",
  brand: "brand",
  paymentMethod: "paymentMethod",
  shippingMethod: "shippingMethod",
  tax: "tax",
  customer: "customer",
  unitOfMeasure: "unitOfMeasure",
  paymentTerm: "paymentTerm",
  vendor: "vendor",
  assetCategory: "assetCategory",
  assetBrand: "assetBrand",
  asset: "asset",
  assetTransfer: "assetTransfer",
  vehicleBrand: "vehicleBrand",
  vehicleModel: "vehicleModel",
  vehicle: "vehicle",
  vehicleFitmentRule: "vehicleFitmentRule",
  project: "project",
  task: "task",
  product: "product",
  bomRevision: "bomRevision",
  workOrder: "workOrder",
  jobChangeOrder: "jobChangeOrder",
  productionOrder: "productionOrder",
  qcChecklist: "qcChecklist",
  qcInspection: "qcInspection",
  nonconformance: "nonconformance",
  withholdingTaxType: "withholdingTaxType",
  recurringTransaction: "recurringTransaction",
  journal: "journal",
  pettyCash: "pettyCash",
  bankStatement: "bankStatement",
  expense: "expense",
  costCenter: "costCenter",
  bankReconciliation: "bankReconciliation",
  bankTransfer: "bankTransfer",
  purchaseAdvance: "purchaseAdvance",
  taxAssessment: "taxAssessment",
  taxPayment: "taxPayment",
  taxInvoice: "taxInvoice",
  withholdingCertificate: "withholdingCertificate",
  invoiceExchange: "invoiceExchange",
  approvalWorkflow: "approvalWorkflow",
  approval: "approval",
  rackRow: "rackRow",
  stockMove: "stockMove",
  materialIssue: "materialIssue",
  stockAdjustment: "stockAdjustment",
  rack: "rack",
  inventoryTransfer: "inventoryTransfer",
  materialRequest: "materialRequest",
  stocktakeSession: "stocktakeSession",
  salesInvoice: "salesInvoice",
  salesPayment: "salesPayment",
  quotation: "quotation",
  salesOrder: "salesOrder",
  salesReturn: "salesReturn",
  deliveryOrder: "deliveryOrder",
  downPayment: "downPayment",
  vendorPayment: "vendorPayment",
  goodsReceipt: "goodsReceipt",
  purchaseRequest: "purchaseRequest",
  purchaseOrder: "purchaseOrder",
  purchaseReturn: "purchaseReturn",
  vendorBill: "vendorBill",
  appreciation: "appreciation",
  leaveRequest: "leaveRequest",
  timesheet: "timesheet",
  overtimeRequest: "overtimeRequest",
  attendanceCorrection: "attendanceCorrection",
  payroll: "payroll",
  employeeLoan: "employeeLoan",
  // BR-LOAN-07/08 (162-V): dokumen ber-slug penomoran berelasi.
  employeeLoanRepayment: "employeeLoanRepayment",
  employeeLoanWriteOff: "employeeLoanWriteOff",
  probationReview: "probationReview",
  employeeDisciplinaryRecord: "employeeDisciplinaryRecord",
  disciplinaryDeductionDecision: "disciplinaryDeductionDecision",
  contractDecisionRequest: "contractDecisionRequest",
  lead: "lead",
  crmTicket: "crmTicket",
  role: "role",
  user: "user",
  customerVehicle: "customerVehicle",
} as const

export type SluggedModel = keyof typeof SLUGGED_MODELS

interface NextSlugOptions {
  /** Row id to exclude when checking collisions (use on update). */
  excludeId?: number
  /** Fallback stem when `base` has no slug-able characters. */
  fallback?: string
}

/**
 * Return a unique slug for `base` on the given model, or `null` when the model
 * is not slugged (so callers can skip writing the column).
 */
export async function nextSlug(
  model: SluggedModel,
  base: string | null | undefined,
  options: NextSlugOptions = {},
): Promise<string | null> {
  const delegate = SLUGGED_MODELS[model]
  if (!delegate) return null

  const d = prisma[delegate as keyof typeof prisma] as unknown as {
    findFirst: (args: {
      where: Record<string, unknown>
      select: { id: true }
    }) => Promise<{ id: number } | null>
  }

  return buildUniqueSlug(
    base,
    async (candidate) => {
      const existing = await d.findFirst({
        where:
          options.excludeId != null
            ? { slug: candidate, id: { not: options.excludeId } }
            : { slug: candidate },
        select: { id: true },
      })
      return existing !== null
    },
    options.fallback,
  )
}
