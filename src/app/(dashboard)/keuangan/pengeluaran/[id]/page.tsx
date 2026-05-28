export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteExpense } from "@/actions/finance.actions"
import { PrintButton } from "@/components/ui/print-button"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { Pencil } from "lucide-react"

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const expense = await prisma.expense.findUnique({
    where: { id: Number(id) },
  })

  if (!expense) notFound()

  const project = expense.projectId
    ? await prisma.project.findUnique({ where: { id: expense.projectId }, select: { id: true, name: true, documentNo: true } })
    : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pengeluaran ${expense.documentNo}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Finance", href: "/finance" },
          { label: "Expenses", href: "/finance/expenses" },
          { label: expense.documentNo },
        ]}
        badge={<StatusChip status={expense.status} />}
        actions={<>
          <Button href={`/finance/expenses/${expense.id}/edit`} variant="primary"><Pencil size={14} /> Edit</Button>
          <PrintButton />
          <DeleteButton id={expense.id} action={deleteExpense} />
          <BackButton href="/finance/expenses" />
        </>}
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={expense.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(expense.date)} />
        <DetailField label="Jumlah" value={formatCurrency(Number(expense.amount))} />
        <DetailField label="Kategori" value={expense.category || "-"} />
        <DetailField label="Status" value={<StatusChip status={expense.status} />} />
        <DetailField label="Account ID" value={expense.accountId} />
        {expense.paidFromAccountId && <DetailField label="Dibayar dari Account ID" value={expense.paidFromAccountId} />}
        {expense.employeeId && <DetailField label="Employee ID" value={expense.employeeId} />}
        {expense.description && <DetailField label="Deskripsi" value={expense.description} colSpan="full" />}
        {project && (
          <DetailField label="Proyek" value={
            <Link href={`/projects/${project.id}`} className="text-primary hover:underline">{project.documentNo ? `${project.documentNo} - ` : ""}{project.name}</Link>
          } />
        )}
        {expense.referenceNo && <DetailField label="No. Referensi" value={expense.referenceNo} mono />}
        {expense.receiptImage && (
          <DetailField label="Bukti / Kwitansi" value={
            <a href={expense.receiptImage} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Lihat Bukti</a>
          } />
        )}
        <DetailField label="Dibuat" value={formatDate(expense.createdAt)} />
      </DetailCard>

      <TransactionAttachments referenceType="expense" referenceId={expense.id} />
    </div>
  )
}
