export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { parsePagination } from "@/lib/utils/pagination";
import { withListParams } from "@/lib/utils/list-href";
import Link from "next/link";
import {
  statusLabel,
  statusToIndo,
  indoToStatus,
} from "@/lib/utils/status-labels";
import { PageHeader } from "@/components/ui/page-header";
import { CanCreate } from "@/components/auth/can-create";
import { BankReconciliationDraftQueueCard } from "@/components/reports/bank-reconciliation-draft-queue-card";
import { getBankReconciliationDraftQueue } from "@/lib/reports/bank-reconciliation-draft-queue-data";
import { BankReconciliationTable, type BankReconciliationRow } from "./_components/bank-reconciliation-table";
import {
  Plus,
  Landmark,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
} from "@/components/ui/fontawesome-icons";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Rekonsiliasi Bank" };

export default async function BankReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ halaman?: string; status?: string; pageSize?: string; cari?: string }>;
}) {
  await requirePermission("view_bank_reconciliation");

  const params = await searchParams;
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined;
  const { page, pageSize, take } = parsePagination(params);
  const search = params.cari?.trim() || undefined;

  const where = {
    deletedAt: null,
    ...((dbStatusParam || params.status) && {
      status: dbStatusParam || params.status,
    }),
    ...(search && {
      reconciliationNumber: { contains: search },
    }),
  };

  const [reconciliations, total, draftCount, completedCount] = await Promise.all([
    prisma.bankReconciliation.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take,
    }),
    prisma.bankReconciliation.count({ where }),
    prisma.bankReconciliation.count({ where: { status: "draft", deletedAt: null } }),
    prisma.bankReconciliation.count({ where: { status: "completed", deletedAt: null } }),
  ]);

  // Muat akun bank terkait
  const accountIds = Array.from(new Set(reconciliations.map((r) => r.accountId)));
  const accounts = accountIds.length > 0
    ? await prisma.account.findMany({
        where: { id: { in: accountIds } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const draftQueue = await getBankReconciliationDraftQueue();

  const tableData: BankReconciliationRow[] = reconciliations.map((r) => {
    const acc = accountMap.get(r.accountId);
    return {
      id: r.id,
      slug: r.slug,
      reconciliationNumber: r.reconciliationNumber,
      accountId: r.accountId,
      accountCode: acc?.code ?? null,
      accountName: acc?.name ?? null,
      statementDate: r.statementDate.toISOString(),
      statementBalance: Number(r.statementBalance),
      bookBalance: Number(r.bookBalance),
      difference: Number(r.difference),
      matchedCount: r.items.filter((i) => i.matched).length,
      totalItems: r.items.length,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const statusChips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {["", "draft", "completed"].map((dbStatus) => {
        const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : "";
        const isActive = params.status === urlStatus || (!params.status && !urlStatus);
        return (
          <Link
            key={dbStatus}
            href={withListParams("/keuangan/rekonsiliasi-bank", params, {
              status: urlStatus || undefined,
              halaman: undefined,
            })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "bg-foreground text-background font-semibold"
                : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {dbStatus ? statusLabel(dbStatus) : "Semua Status"}
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rekonsiliasi Bank"
        subtitle="Pencocokan saldo rekening koran bank fisik dengan catatan buku besar kas/bank perusahaan untuk memastikan akurasi saldo kas."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Rekonsiliasi Bank" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/keuangan/laporan-bank"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
            >
              <FileSpreadsheet className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Rekening Koran</span>
            </Link>
            <CanCreate permission="manage_bank_reconciliation">
              <Link
                href="/keuangan/rekonsiliasi-bank/tambah"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-2xs transition-colors"
                id="create-recon-btn"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Buat Rekonsiliasi</span>
              </Link>
            </CanCreate>
          </div>
        }
      />

      {/* Financial Metric Strip */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-3">
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Total Rekonsiliasi Tercatat</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {total} <span className="text-sm font-normal text-muted-foreground">sesi</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-amber-500" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Dalam Proses (Draf)</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
            {draftCount} <span className="text-sm font-normal text-muted-foreground">sesi</span>
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Selesai / Rekonsil</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
            {completedCount} <span className="text-sm font-normal text-muted-foreground">sesi</span>
          </p>
        </div>
      </div>

      {/* Seksi Audit / Exception Queue */}
      <BankReconciliationDraftQueueCard queue={draftQueue} />

      {/* Main Data Table */}
      <BankReconciliationTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        filters={statusChips}
      />
    </div>
  );
}
