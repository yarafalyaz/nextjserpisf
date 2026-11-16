export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAnyPermission } from "@/lib/auth/permissions";
import { APPROVAL_REFERENCE_PERMISSIONS } from "@/lib/auth/approval-permissions";
import { formatCurrencyExact, formatDate } from "@/lib/utils/format";
import { EmptyState } from "@/components/ui/empty-state";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { ExternalLink, ShieldAlert, Info } from "@/components/ui/fontawesome-icons";
import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval";
import { StatusChip } from "@/components/ui/status-chip";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { loadApprovalDocumentSummary } from "@/lib/reports/approval-document-summary";
import { ApprovalActionPanel } from "./_components/approval-action-panel";
import { ApprovalHistoryTable, ApprovalJournalPreviewTable } from "./_components/approval-tables";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Persetujuan" };

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Administrator",
  owner: "Pemilik",
  director: "Direktur",
  manager: "Manajer",
  finance: "Keuangan",
  finance_manager: "Manajer Keuangan",
  accounting: "Akuntansi",
  sales: "Penjualan",
  sales_manager: "Manajer Penjualan",
  purchasing: "Pembelian",
  warehouse: "Gudang",
  warehouse_manager: "Kepala Gudang",
  production: "Produksi",
  production_manager: "Manajer Produksi",
  hr: "SDM",
  hrd: "SDM",
  hr_manager: "Manajer SDM",
  employee: "Karyawan",
  mechanic: "Mekanik",
  technician: "Teknisi",
};

function formatRoleLabel(roleName: string): string {
  const mapped = ROLE_DISPLAY_LABELS[roleName.toLowerCase()];
  if (mapped) return mapped;
  return roleName
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Approval details and history can contain data from unrelated modules.
  // R6WN-06: gerbang kasar any-permission, lalu permission referensi
  // approval ini sendiri — approveStep/rejectStep tetap penegak akhir.
  const user = await requireAnyPermission([
    "approve_workflows",
    ...Object.values(APPROVAL_REFERENCE_PERMISSIONS),
  ] as Parameters<typeof requireAnyPermission>[0]);
  const { slug } = await params;

  const approvalInclude = {
    workflow: { include: { steps: { orderBy: { stepOrder: "asc" as const } } } },
    histories: { orderBy: { createdAt: "desc" as const } },
  };

  const approval = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.approval.findFirst({ where: { slug: s }, include: approvalInclude }),
      byId: (id) => prisma.approval.findUnique({ where: { id }, include: approvalInclude }),
    },
  );

  if (!approval) notFound();

  const referencePermission = APPROVAL_REFERENCE_PERMISSIONS[approval.referenceType];
  const isSuperAdmin = user.roles.includes("super_admin");
  const canViewApproval =
    isSuperAdmin ||
    (user.permissions ?? []).includes("approve_workflows") ||
    (!!referencePermission && (user.permissions ?? []).includes(referencePermission));
  if (!canViewApproval) redirect("/pengaturan/persetujuan");

  const userIds = Array.from(
    new Set(
      [
        ...approval.histories.map((h) => h.userId),
        ...approval.workflow.steps.map((s) => s.userId),
        approval.requestedBy,
      ].filter((id): id is number => typeof id === "number"),
    ),
  );
  const roleIds = Array.from(
    new Set(
      approval.workflow.steps
        .map((s) => s.roleId)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  const [users, roles, docSummary] = await Promise.all([
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    roleIds.length > 0
      ? prisma.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    loadApprovalDocumentSummary(approval.referenceType, approval.referenceId),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const roleMap = new Map(roles.map((r) => [r.id, r.name]));

  const modelLabel = APPROVAL_MODEL_LABELS[approval.referenceType] || approval.referenceType;
  const referenceTitle = docSummary?.documentNo ?? `${modelLabel} #${approval.referenceId}`;
  const requesterName = approval.requestedBy
    ? (userMap.get(approval.requestedBy) ?? `Pengguna #${approval.requestedBy}`)
    : "-";

  const activeStep = approval.workflow.steps.find(
    (s) => s.stepOrder === approval.currentStep,
  );
  const activeStepRoleName = activeStep?.roleId ? roleMap.get(activeStep.roleId) : null;
  const activeStepUserName = activeStep?.userId ? userMap.get(activeStep.userId) : null;
  const activeApproverLabel = activeStepUserName
    ? activeStepUserName
    : activeStepRoleName
      ? `Peran ${formatRoleLabel(activeStepRoleName)}`
      : "Penyetuju belum ditentukan";

  const isCreator =
    !isSuperAdmin &&
    approval.requestedBy !== null &&
    approval.requestedBy === Number(user.id);

  const isStepApprover =
    isSuperAdmin ||
    (!!activeStep &&
      (activeStep.userId !== null
        ? Number(user.id) === activeStep.userId
        : activeStepRoleName !== null &&
          activeStepRoleName !== undefined &&
          user.roles.includes(activeStepRoleName)));

  const totalDebit = docSummary?.entries?.reduce((acc, e) => acc + e.debit, 0) ?? 0;
  const totalCredit = docSummary?.entries?.reduce((acc, e) => acc + e.credit, 0) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Persetujuan", href: "/pengaturan/persetujuan" },
          { label: referenceTitle },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              Persetujuan {modelLabel}
            </h1>
            <StatusChip status={approval.status} />
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            {referenceTitle}
          </p>
        </div>
        {docSummary?.href && (
          <Link
            href={docSummary.href}
            className="inline-flex items-center justify-center rounded-lg border border-default bg-surface px-3 py-2 text-sm font-medium text-foreground shadow-2xs transition-colors hover:bg-surface-muted min-h-11 sm:min-h-9 self-start sm:self-auto"
          >
            <ExternalLink className="size-3.5 mr-1.5" aria-hidden="true" />
            Buka Dokumen Sumber
          </Link>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-5 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Alur Kerja
            </span>
            <p className="text-sm font-medium text-foreground mt-1">
              {approval.workflow.name}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Dokumen Referensi
            </span>
            <p className="text-sm font-mono text-foreground mt-1">
              {docSummary?.href ? (
                <Link href={docSummary.href} className="text-primary hover:underline">
                  {referenceTitle}
                </Link>
              ) : (
                referenceTitle
              )}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Pemohon
            </span>
            <p className="text-sm font-medium text-foreground mt-1">
              {requesterName}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Langkah Saat Ini
            </span>
            <p className="text-sm text-foreground mt-1 tabular-nums">
              Langkah {approval.currentStep} / {approval.workflow.steps.length}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tanggal Permintaan
            </span>
            <p className="text-sm text-foreground mt-1 tabular-nums">
              {approval.requestedAt
                ? formatDate(approval.requestedAt)
                : formatDate(approval.createdAt)}
            </p>
          </div>
          {docSummary?.date && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Tanggal Dokumen
              </span>
              <p className="text-sm text-foreground mt-1 tabular-nums">
                {formatDate(docSummary.date)}
              </p>
            </div>
          )}
          {docSummary?.amount !== null && docSummary?.amount !== undefined && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Nilai Transaksi
              </span>
              <p className="text-sm font-semibold text-foreground mt-1 font-mono tabular-nums">
                {formatCurrencyExact(docSummary.amount)}
              </p>
            </div>
          )}
          {docSummary?.partyLabel && docSummary?.partyName && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {docSummary.partyLabel}
              </span>
              <p className="text-sm text-foreground mt-1">
                {docSummary.partyName}
              </p>
            </div>
          )}
          {docSummary?.description && (
            <div className="sm:col-span-2 lg:col-span-4 border-t border-default/60 pt-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Keterangan Dokumen
              </span>
              <p className="text-sm text-foreground mt-1">
                {docSummary.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Document Entries Preview (Journal) */}
      {docSummary?.entries && docSummary.entries.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">
              Pratinjau Baris Jurnal
            </h2>
            {docSummary.href && (
              <Link href={docSummary.href} className="text-xs font-medium text-primary hover:underline">
                Lihat Detail Lengkap →
              </Link>
            )}
          </div>
          <div className="p-4 px-5">
            <ApprovalJournalPreviewTable
              data={docSummary.entries}
              totalDebit={totalDebit}
              totalCredit={totalCredit}
            />
          </div>
        </div>
      )}

      {/* Workflow Steps */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-5 sm:p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
          Langkah Alur Kerja
        </h2>
        <div className="flex flex-col gap-2.5">
          {approval.workflow.steps.map((step) => {
            const isActive =
              step.stepOrder === approval.currentStep &&
              approval.status === "pending";
            const isDone =
              step.stepOrder < approval.currentStep ||
              approval.status === "approved";
            const stepRoleName = step.roleId ? roleMap.get(step.roleId) : null;
            const stepUserName = step.userId ? userMap.get(step.userId) : null;
            const stepApproverText = stepUserName
              ? `Pengguna: ${stepUserName}`
              : stepRoleName
                ? `Peran: ${formatRoleLabel(stepRoleName)}`
                : step.approverType
                  ? step.approverType
                  : "Penyetuju belum ditentukan";
            const stepHistory = approval.histories.find(
              (h) => h.step === step.stepOrder,
            );

            return (
              <div
                key={step.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg border ${isActive ? "border-primary bg-primary/5" : isDone ? "border-success/30 bg-success/5" : "border-default"}`}
              >
                <div
                  className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success text-success-foreground" : "bg-default text-muted-foreground"}`}
                >
                  {step.stepOrder}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {step.name || `Langkah ${step.stepOrder}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({stepApproverText})
                    </span>
                  </div>
                  {stepHistory && (
                    <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                      {stepHistory.action === "approve" ? "Disetujui" : "Ditolak"} oleh{" "}
                      {stepHistory.userId ? (userMap.get(stepHistory.userId) ?? `Pengguna #${stepHistory.userId}`) : "-"} ·{" "}
                      {formatDate(stepHistory.createdAt, { includeTime: true })}
                    </p>
                  )}
                </div>
                {isActive && (
                  <span className="text-xs font-medium text-primary">
                    Menunggu Keputusan
                  </span>
                )}
                {isDone && (
                  <span className="text-xs font-medium text-success">
                    Selesai
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions (Pembuat-Penyetuju & Penyetuju Langkah Aktif gated) */}
      {approval.status === "pending" && (
        isCreator ? (
          <Alert variant="warning">
            <ShieldAlert className="size-4" aria-hidden="true" />
            <AlertTitle>Pembatasan Pembuat &amp; Penyetuju</AlertTitle>
            <AlertDescription>
              Anda adalah pembuat transaksi ini sehingga tidak diperbolehkan menyetujui atau menolak pengajuan Anda sendiri. Menunggu keputusan dari {activeApproverLabel}.
            </AlertDescription>
          </Alert>
        ) : !isStepApprover ? (
          <Alert>
            <Info className="size-4" aria-hidden="true" />
            <AlertTitle>Menunggu Penyetuju Langkah Aktif</AlertTitle>
            <AlertDescription>
              Langkah saat ini ({activeStep?.name || `Langkah ${approval.currentStep}`}) ditugaskan kepada {activeApproverLabel}.
            </AlertDescription>
          </Alert>
        ) : (
          <ApprovalActionPanel approvalId={approval.id} status={approval.status} />
        )
      )}

      {approval.status === "rejected" && (
        <ApprovalActionPanel approvalId={approval.id} status={approval.status} />
      )}

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Riwayat Persetujuan
          </h2>
        </div>
        <div className="p-4 px-5">
          {approval.histories.length === 0 ? (
            <EmptyState title="Belum ada riwayat" className="py-6" />
          ) : (
            <ApprovalHistoryTable
              data={approval.histories.map((h) => ({
                id: h.id,
                step: h.step,
                action: h.action,
                actorName: h.userId ? (userMap.get(h.userId) || `Pengguna #${h.userId}`) : "-",
                notes: h.notes,
                createdAt: h.createdAt.toISOString(),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
