export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";
import { approveStep, rejectStep } from "@/actions/approval.actions";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Persetujuan" };

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("view_dashboard");
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const approval = await prisma.approval.findUnique({
    where: { id: numId },
    include: {
      workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      histories: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!approval) notFound();

  const approveWithId = approveStep.bind(null, approval.id);
  const rejectWithId = rejectStep.bind(null, approval.id);

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Detail Persetujuan
        </h1>
        <span className={`status-badge status-${approval.status}`}>
          {approval.status}
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
              {approval.referenceType} #{approval.referenceId}
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
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-success text-white" : "bg-default text-muted-foreground"}`}
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
              <button
                type="submit"
                formAction={approveWithId}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium bg-success text-white hover:bg-success/90 hover:-translate-y-px hover:shadow-md transition-all"
              >
                Setujui
              </button>
              <button
                type="submit"
                formAction={rejectWithId}
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 hover:-translate-y-px hover:shadow-md transition-all"
              >
                Tolak
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Riwayat Persetujuan
          </h2>
        </div>
        <div className="overflow-x-auto">
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
                  <DetailTableTd
                    colSpan={4}
                    className="text-center py-10 text-muted-foreground"
                  >
                    Belum ada riwayat
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
                        {h.action}
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
    </div>
  );
}
