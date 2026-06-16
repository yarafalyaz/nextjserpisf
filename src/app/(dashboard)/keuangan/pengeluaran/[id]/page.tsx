export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatCurrency } from "@/lib/utils/format";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { DeleteButton } from "@/components/ui/delete-button";
import { deleteExpense } from "@/actions/finance.actions";
import { PrintButton } from "@/components/ui/print-button";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
export const metadata: Metadata = { title: "Pengeluaran" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_expenses");

  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const expense = await prisma.expense.findUnique({
    where: { id: numId },
  });

  if (!expense) notFound();

  const project = expense.projectId
    ? await prisma.project.findUnique({
        where: { id: expense.projectId },
        select: { id: true, name: true, documentNo: true },
      })
    : null;

  // Resolve account/employee IDs to human-readable names
  const accountIds = [expense.accountId, expense.paidFromAccountId].filter(
    (v): v is number => v != null,
  );
  const [accountRows, employee] = await Promise.all([
    accountIds.length
      ? prisma.account.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    expense.employeeId
      ? prisma.employee.findUnique({
          where: { id: expense.employeeId },
          select: { name: true },
        })
      : Promise.resolve(null),
  ]);
  const accountMap = new Map(
    accountRows.map((a) => [a.id, `${a.code} - ${a.name}`]),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Pengeluaran ${expense.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Pengeluaran", href: "/keuangan/pengeluaran" },
          { label: expense.documentNo },
        ]}
        badge={<StatusChip status={expense.status} />}
        actions={
          <>
            <Button
              href={`/keuangan/pengeluaran/${expense.id}/ubah`}
              variant="primary"
            >
              <Pencil size={14} /> Ubah
            </Button>
            <PrintButton />
            <DeleteButton id={expense.id} action={deleteExpense} />
            <BackButton href="/keuangan/pengeluaran" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="No. Dokumen" value={expense.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(expense.date)} />
        <DetailField
          label="Jumlah"
          value={formatCurrency(Number(expense.amount))}
        />
        <DetailField label="Kategori" value={expense.category || "-"} />
        <DetailField
          label="Status"
          value={<StatusChip status={expense.status} />}
        />
        <DetailField
          label="Akun Biaya"
          value={
            expense.accountId != null
              ? (accountMap.get(expense.accountId) ?? `#${expense.accountId}`)
              : "-"
          }
        />
        {expense.paidFromAccountId && (
          <DetailField
            label="Dibayar dari"
            value={
              accountMap.get(expense.paidFromAccountId) ??
              `#${expense.paidFromAccountId}`
            }
          />
        )}
        {expense.employeeId && (
          <DetailField
            label="Karyawan"
            value={employee?.name ?? `#${expense.employeeId}`}
          />
        )}
        {expense.description && (
          <DetailField
            label="Deskripsi"
            value={expense.description}
            colSpan="full"
          />
        )}
        {project && (
          <DetailField
            label="Proyek"
            value={
              <Link
                href={`/proyek/${project.id}`}
                className="text-primary hover:underline"
              >
                {project.documentNo ? `${project.documentNo} - ` : ""}
                {project.name}
              </Link>
            }
          />
        )}
        {expense.referenceNo && (
          <DetailField label="No. Referensi" value={expense.referenceNo} mono />
        )}
        {expense.receiptImage && (
          <DetailField
            label="Bukti / Kwitansi"
            value={
              <a
                href={expense.receiptImage}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Lihat Bukti
              </a>
            }
          />
        )}
        <DetailField label="Dibuat" value={formatDate(expense.createdAt)} />
      </DetailCard>

      <TransactionAttachments
        referenceType="expense"
        referenceId={expense.id}
      />
    </div>
  );
}
