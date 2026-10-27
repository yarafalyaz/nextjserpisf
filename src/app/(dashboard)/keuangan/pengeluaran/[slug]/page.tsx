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
import { ExpenseApprovalActions } from "../_components/expense-approval-actions";
import { ReimbursementVerifyPanel } from "../_components/reimbursement-verify-panel";
import { Pencil } from "lucide-react";

import type { Metadata } from "next";

import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { getSystemSettings } from "@/lib/utils/settings";
import { REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE } from "@/lib/hooks/accounting.hook";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref, entityHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Pengeluaran" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_expenses");

  const { slug } = await params;

  const expenseInclude = {
    category: { select: { label: true } },
    vendor: { select: { name: true } },
  };

  const expense = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.expense.findFirst({ where: { slug: s }, include: expenseInclude }),
      byId: (id) => prisma.expense.findUnique({ where: { id }, include: expenseInclude }),
    },
  );

  if (!expense) notFound();

  const project = expense.projectId
    ? await prisma.project.findUnique({
        where: { id: expense.projectId },
        select: { id: true, slug: true, name: true, documentNo: true },
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

  const canVerifyReimbursement =
    expense.isReimbursementClaim && (await hasPermission("approve_expenses"));
  const verifyAccounts = canVerifyReimbursement
    ? await prisma.account.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, type: true },
      })
    : [];

  // Fakta gerbang bayar/setujui dari server (temuan Accountant PR #869):
  // gerbang inti menolak bila akun liabilitas 210209 belum terpetakan aktif
  // atau — untuk klaim approved — jurnal akrual J-RB1 aktif tidak ada
  // (mis. sudah di-reversal). UI hanya meneruskan notice; penilaian jurnal
  // aktif tetap milik server (Backend t_b228bac8), bukan hitungan komponen.
  let paymentBlockerNotice: string | null = null;
  if (canVerifyReimbursement) {
    const settings = await getSystemSettings();
    const liabilityId = settings.reimbursementLiabilityAccountId;
    const liabilityAccount = liabilityId
      ? await prisma.account.findUnique({
          where: { id: liabilityId },
          select: { code: true, isActive: true },
        })
      : null;
    const liabilityBlocked =
      !liabilityAccount || liabilityAccount.code !== "210209" || !liabilityAccount.isActive;
    let accrualBlocked = false;
    if (expense.status === "approved") {
      const activeAccrual = await prisma.journal.findFirst({
        where: {
          referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
          referenceId: expense.id,
          status: { not: "REVERSED" },
          deletedAt: null,
        },
        select: { id: true },
      });
      accrualBlocked = !activeAccrual;
    }
    if (liabilityBlocked || accrualBlocked) {
      paymentBlockerNotice = "Menunggu perbaikan gerbang (t_b228bac8)";
    }
  }

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
            <CanCreate permission="edit_expenses">
              <Button
                href={entityEditHref("/keuangan/pengeluaran", expense)}
                variant="primary"
              >
                <Pencil size={14} /> Ubah
              </Button>
            </CanCreate>
            <PrintButton documentType="expense" documentId={expense.id} />
            <CanCreate permission="delete_expenses">
              <DeleteButton id={expense.id} action={deleteExpense} />
            </CanCreate>
            <BackButton href="/keuangan/pengeluaran" />
          </>
        }
      />

      {/* Klaim reimbursement: lifecycle lewat panel verifikasi (tetapkan
          akun wajib sebelum approve) — ExpenseApprovalActions disembunyikan
          agar tidak ada jalur approve dengan akun placeholder. */}
      {!expense.isReimbursementClaim && (
        <ExpenseApprovalActions status={expense.status} id={expense.id} />
      )}

      {canVerifyReimbursement && (
        <ReimbursementVerifyPanel
          expenseId={expense.id}
          status={expense.status}
          isReimbursementClaim={expense.isReimbursementClaim}
          accountId={expense.accountId}
          paidFromAccountId={expense.paidFromAccountId}
          accounts={verifyAccounts}
          paymentBlockerNotice={paymentBlockerNotice}
        />
      )}

      <DetailCard>
        <DetailField label="No. Dokumen" value={expense.documentNo} mono />
        <DetailField label="Tanggal" value={formatDate(expense.date)} />
        <DetailField
          label="Jumlah"
          value={formatCurrency(Number(expense.amount))}
        />
        <DetailField label="Kategori" value={expense.category?.label || "-"} />
        <DetailField label="Vendor" value={expense.vendor?.name || "-"} />
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
                href={entityHref("/proyek", project)}
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
