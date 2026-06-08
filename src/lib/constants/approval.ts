/** Document types that can be routed through an approval workflow. */
export const APPROVAL_MODEL_TYPES = ["PurchaseOrder", "Expense"] as const

export type ApprovalModelType = (typeof APPROVAL_MODEL_TYPES)[number]
