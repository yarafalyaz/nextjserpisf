export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { approveStep, rejectStep, reopenApproval } from "@/actions/approval.actions";
import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval";
import { statusLabel } from "@/lib/utils/status-labels";
import { SubmitButton } from "@/components/ui/submit-button";
import { resolveEntity } from "@/lib/utils/resolve-entity";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Persetujuan" };

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // Approval details and history can contain data from unrelated modules.
  await requirePermission("approve_workflows");
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

  const approveWithId = approveStep.bind(null, approval.id);
  const rejectWithId = rejectStep.bind(null, approval.id);
  const reopenWithId = reopenApproval.bind(null, approval.id);

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Persetujuan", href: "/pengaturan/persetujuan" },
          { label: `#${approval.id}` },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          Detail Persetujuan
        </h1>
        <span className={`status-badge status-${approval.status}`}>
          {statusLabel(approval.status)}
        </span>
      </div>

      {/* Info Card */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              Referensi
            </span>
            <p className="text-sm font-mono text-foreground mt-1">
              {APPROVAL_MODEL_LABELS[approval.referenceType] || approval.referenceType} #{approval.referenceId}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Langkah Saat Ini
            </span>
            <p className="text-sm text-foreground mt-1">
              Langkah {approval.currentStep} / {approval.workflow.steps.length}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tanggal Permintaan
            </span>
            <p className="text-sm text-foreground mt-1">
              {approval.requestedAt
                ? formatDate(approval.requestedAt)
                : formatDate(approval.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
          Langkah Alur Kerja
        </h2>
        <div className="flex flex-col gap-2">
          {approval.workflow.steps.map((step) => {
            const isActive =
              step.stepOrder === approval.currentStep &&
              approval.status === "pending";
            const isDone =
              step.stepOrder < approval.currentStep ||
              approval.status === "approved";
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${isActive ? "border-primary bg-primary/5" : isDone ? "border-success/30 bg-success/5" : "border-default"}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success text-success-foreground" : "bg-default text-muted-foreground"}`}
                >
                  {step.stepOrder}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">
                    {step.name || `Langkah ${step.stepOrder}`}
                  </span>
                  {step.approverType && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({step.approverType})
                    </span>
                  )}
                </div>
                {isActive && (
                  <span className="text-xs font-medium text-primary">
                    Saat Ini
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

      {/* Approve/Reject Form */}
      {approval.status === "pending" && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
            Tindakan
          </h2>
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="notes"
                className="text-sm font-medium text-foreground"
              >
                Catatan (opsional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                placeholder="Tambahkan catatan..."
                className="w-full px-3 py-2.5 rounded-lg border border-default bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton
                formAction={approveWithId}
                variant="success"
                pendingLabel="Memproses..."
              >
                Setujui
              </SubmitButton>
              <SubmitButton
                formAction={rejectWithId}
                variant="danger"
                pendingLabel="Memproses..."
              >
                Tolak
              </SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* Reopen — hanya untuk approval yang ditolak.
          reopenApproval mengembalikan { success } bukan void, jadi tidak bisa
          dipakai sebagai formAction langsung: bungkus agar tipenya Promise<void>. */}
      {approval.status === "rejected" && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden p-6">
          <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">
            Tindakan
          </h2>
          <form
            className="flex flex-col gap-4"
            action={async () => {
              "use server"
              const result = await reopenWithId()
              if (!result.success) throw new Error(result.error || "Gagal membuka ulang")
            }}
          >
            <p className="text-sm text-muted-foreground">
              Persetujuan ini ditolak. Buka ulang untuk mengembalikan dokumen ke
              draf dan mengajukan persetujuan baru.
            </p>
            <div className="flex items-center gap-3">
              <SubmitButton pendingLabel="Membuka...">Buka Ulang</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Riwayat Persetujuan
          </h2>
        </div>
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Langkah</DetailTableTh>
              <DetailTableTh>Aksi</DetailTableTh>
              <DetailTableTh>Catatan</DetailTableTh>
              <DetailTableTh>Waktu</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {approval.histories.length === 0 ? (
                <DetailTableRow>
                  <DetailTableTd colSpan={4} className="py-10">
                    <EmptyState title="Belum ada riwayat" className="py-0" />
                  </DetailTableTd>
                </DetailTableRow>
              ) : (
                approval.histories.map((h) => (
                  <DetailTableRow key={h.id}>
                    <DetailTableTd>Langkah {h.step}</DetailTableTd>
                    <DetailTableTd>
                      <span
                        className={`status-badge ${h.action === "approve" ? "status-approved" : "status-rejected"}`}
                      >
                        {h.action === "approve" ? "Disetujui" : "Ditolak"}
                      </span>
                    </DetailTableTd>
                    <DetailTableTd>{h.notes || "-"}</DetailTableTd>
                    <DetailTableTd>{formatDate(h.createdAt)}</DetailTableTd>
                  </DetailTableRow>
                ))
              )}
            </DetailTableBody>
          </DetailTable>
      </div>
    </div>
  );
}
