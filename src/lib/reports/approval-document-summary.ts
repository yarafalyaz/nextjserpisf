import { prisma } from "@/lib/db/prisma"
import { referenceHref } from "@/lib/utils/format"

export interface ApprovalJournalEntryPreview {
  id: number
  accountCode: string
  accountName: string
  memo: string | null
  debit: number
  credit: number
}

export interface ApprovalDocumentSummary {
  documentNo: string
  date: Date | null
  status: string
  description: string | null
  amount: number | null
  partyLabel: string | null
  partyName: string | null
  href: string | null
  journalType?: string | null
  entries?: ApprovalJournalEntryPreview[]
}

/**
 * Memuat ringkasan dokumen sumber untuk halaman detail persetujuan agar
 * approver melihat nomor dokumen, nilai transaksi, pihak terkait, tautan
 * dokumen sumber, dan baris jurnal (khusus Journal) sebelum mengambil keputusan.
 */
export async function loadApprovalDocumentSummary(
  referenceType: string,
  referenceId: number,
): Promise<ApprovalDocumentSummary | null> {
  switch (referenceType) {
    case "Journal": {
      const doc = await prisma.journal.findUnique({
        where: { id: referenceId },
        include: {
          entries: {
            include: { account: { select: { code: true, name: true } } },
            orderBy: { id: "asc" },
          },
        },
      })
      if (!doc) return null
      return {
        documentNo: doc.journalNumber,
        date: doc.transactionDate,
        status: doc.status,
        description: doc.description,
        amount: Number(doc.totalDebit),
        partyLabel: "Tipe Jurnal",
        partyName: doc.type,
        href: referenceHref("Journal", doc.id, doc.slug),
        journalType: doc.type,
        entries: doc.entries.map((e) => ({
          id: e.id,
          accountCode: e.account.code,
          accountName: e.account.name,
          memo: e.memo,
          debit: Number(e.debit),
          credit: Number(e.credit),
        })),
      }
    }
    case "PurchaseOrder": {
      const doc = await prisma.purchaseOrder.findUnique({
        where: { id: referenceId },
        include: { vendor: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.notes,
        amount: Number(doc.totalAmount),
        partyLabel: "Pemasok",
        partyName: doc.vendor?.name ?? null,
        href: referenceHref("PurchaseOrder", doc.id, doc.slug),
      }
    }
    case "PurchaseRequest": {
      const doc = await prisma.purchaseRequest.findUnique({
        where: { id: referenceId },
        include: { vendor: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.description ?? doc.title,
        amount: null,
        partyLabel: doc.vendor ? "Pemasok Referensi" : null,
        partyName: doc.vendor?.name ?? null,
        href: referenceHref("PurchaseRequest", doc.id, doc.slug),
      }
    }
    case "Expense": {
      const doc = await prisma.expense.findUnique({
        where: { id: referenceId },
        include: { vendor: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.description,
        amount: Number(doc.amount),
        partyLabel: doc.vendor ? "Pemasok" : null,
        partyName: doc.vendor?.name ?? null,
        href: referenceHref("Expense", doc.id, doc.slug),
      }
    }
    case "SalesInvoice": {
      const doc = await prisma.salesInvoice.findUnique({
        where: { id: referenceId },
        include: { customer: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.notes,
        amount: Number(doc.grandTotal),
        partyLabel: "Pelanggan",
        partyName: doc.customer?.name ?? null,
        href: referenceHref("SalesInvoice", doc.id, doc.slug),
      }
    }
    case "Quotation": {
      const doc = await prisma.quotation.findUnique({
        where: { id: referenceId },
        include: { customer: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.notes,
        amount: Number(doc.grandTotal),
        partyLabel: "Pelanggan",
        partyName: doc.customer?.name ?? null,
        href: referenceHref("Quotation", doc.id, doc.slug),
      }
    }
    case "VendorPayment": {
      const doc = await prisma.vendorPayment.findUnique({
        where: { id: referenceId },
        include: { vendor: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo,
        date: doc.paymentDate,
        status: doc.status,
        description: doc.notes,
        amount: Number(doc.amount),
        partyLabel: "Pemasok",
        partyName: doc.vendor?.name ?? null,
        href: `/pembelian/pembayaran-vendor/${doc.slug ?? doc.id}`,
      }
    }
    case "Payroll": {
      const doc = await prisma.payroll.findUnique({
        where: { id: referenceId },
        include: { employee: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo,
        date: doc.createdAt,
        status: doc.status,
        description: `Periode ${doc.period}`,
        amount: Number(doc.netSalary),
        partyLabel: "Karyawan",
        partyName: doc.employee?.name ?? null,
        href: referenceHref("Payroll", doc.id, doc.slug),
      }
    }
    case "Project": {
      const doc = await prisma.project.findUnique({
        where: { id: referenceId },
        include: { customer: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `PRJ-${doc.id}`,
        date: doc.startDate ?? doc.createdAt,
        status: doc.status,
        description: doc.name,
        amount: doc.contractAmount != null ? Number(doc.contractAmount) : null,
        partyLabel: "Pelanggan",
        partyName: doc.customer?.name ?? null,
        href: referenceHref("Project", doc.id, doc.slug),
      }
    }
    case "EmployeeLoan": {
      const doc = await prisma.employeeLoan.findUnique({
        where: { id: referenceId },
        include: { employee: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.slug ?? `LN-${doc.id}`,
        date: doc.loanDate,
        status: doc.status,
        description: doc.notes,
        amount: Number(doc.totalAmount),
        partyLabel: "Karyawan",
        partyName: doc.employee?.name ?? null,
        href: referenceHref("EmployeeLoan", doc.id, doc.slug),
      }
    }
    case "LeaveRequest": {
      const doc = await prisma.leaveRequest.findUnique({
        where: { id: referenceId },
        include: { employee: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.slug ?? `LV-${doc.id}`,
        date: doc.startDate,
        status: doc.status,
        description: doc.reason,
        amount: null,
        partyLabel: "Karyawan",
        partyName: doc.employee?.name ?? null,
        href: referenceHref("LeaveRequest", doc.id, doc.slug),
      }
    }
    case "OvertimeRequest": {
      const doc = await prisma.overtimeRequest.findUnique({
        where: { id: referenceId },
        include: { employee: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.slug ?? `OT-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.reason,
        amount: null,
        partyLabel: "Karyawan",
        partyName: doc.employee?.name ?? null,
        href: referenceHref("OvertimeRequest", doc.id, doc.slug),
      }
    }
    case "StockAdjustment": {
      const doc = await prisma.stockAdjustment.findUnique({
        where: { id: referenceId },
        include: { warehouse: { select: { name: true } } },
      })
      if (!doc) return null
      return {
        documentNo: doc.documentNo ?? `INV-${doc.id}`,
        date: doc.date,
        status: doc.status,
        description: doc.reason,
        amount: null,
        partyLabel: "Gudang",
        partyName: doc.warehouse?.name ?? null,
        href: referenceHref("StockAdjustment", doc.id, doc.slug),
      }
    }
    case "Asset": {
      const doc = await prisma.asset.findUnique({
        where: { id: referenceId },
      })
      if (!doc) return null
      return {
        documentNo: doc.code,
        date: doc.purchaseDate,
        status: doc.status,
        description: doc.name,
        amount: Number(doc.purchaseCost),
        partyLabel: null,
        partyName: null,
        href: referenceHref("Asset", doc.id, doc.slug),
      }
    }
    default:
      return null
  }
}
