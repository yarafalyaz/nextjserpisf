export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatPeriod } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader, BackButton } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope";
import { Pencil } from "lucide-react";
import { ApprovePayrollButton } from "./_components/approve-button";
import { MarkPaidPayrollButton } from "./_components/mark-paid-button";
import {
  DetailTable,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table";

import type { Metadata } from "next";

import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
import { hasPermission } from "@/lib/auth/permissions";
import { PayrollComponentLines } from "@/components/payroll/payroll-component-lines";
import { PayrollCommissionLines } from "@/components/payroll/payroll-commission-lines";
import { PayrollBpjsAggregateSnapshot } from "@/components/payroll/payroll-bpjs-aggregate-snapshot";

export const metadata: Metadata = { title: "Penggajian" };

export default async function PayrollDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requirePermission("view_payroll");
  const scope = await getHrScope(user);

  const { slug } = await params;

  const payroll = await resolveEntity(
    { segment: slug, fallbackWhere: hrScopeWhere(scope) },
    {
      bySlug: (s, where) =>
        prisma.payroll.findFirst({
          where: { slug: s, ...where },
          include: { employee: true, componentLines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
        }),
      byId: (id, where) =>
        prisma.payroll.findUnique({
          where: { id, ...where },
          include: { employee: true, componentLines: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
        }),
    },
  );

  if (!payroll) notFound();

  const [activeComponents, canEditPayroll, commissionDebts] = await Promise.all([
    prisma.payrollComponent.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, recurrence: true },
    }),
    hasPermission("edit_payroll"),
    payroll.employeeId != null
      ? prisma.commissionPayable.findMany({
          where: { salesEmployeeId: payroll.employeeId },
          select: {
            id: true,
            salesInvoiceId: true,
            accruedAmount: true,
            reversalAmount: true,
            paidAmount: true,
            salesInvoice: { select: { documentNo: true } },
          },
          orderBy: { id: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const fmt = (val: unknown) => Number(val ?? 0).toLocaleString("id-ID");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Penggajian ${payroll.documentNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "SDM", href: "/sdm" },
          { label: "Penggajian", href: "/sdm/penggajian" },
          { label: payroll.documentNo },
        ]}
        badge={<StatusChip status={payroll.status} />}
        actions={
          <div className="flex gap-2">
            {payroll.status === "draft" && (
              <>
                <ApprovePayrollButton payrollId={payroll.id} />
                <CanCreate permission="edit_payroll">
                  <Button
                    href={entityEditHref("/sdm/penggajian", payroll)}
                    variant="secondary"
                  >
                    <Pencil size={14} /> Ubah
                  </Button>
                </CanCreate>
              </>
            )}
            {payroll.status === "approved" && (
              <MarkPaidPayrollButton payrollId={payroll.id} />
            )}
            <BackButton href="/sdm/penggajian" />
          </div>
        }
      />

      <DetailCard title="Informasi Penggajian">
        <DetailField label="No. Dokumen" value={payroll.documentNo} mono />
        <DetailField label="Karyawan" value={payroll.employee?.name ?? "-"} />
        <DetailField label="Periode" value={formatPeriod(payroll.period)} />
        <DetailField
          label="Status"
          value={<StatusChip status={payroll.status} />}
        />
        <DetailField
          label="Tanggal Mulai"
          value={formatDate(payroll.startDate)}
        />
        <DetailField
          label="Tanggal Selesai"
          value={formatDate(payroll.endDate)}
        />
        {payroll.paymentDate && (
          <DetailField
            label="Tanggal Pembayaran"
            value={formatDate(payroll.paymentDate)}
          />
        )}
      </DetailCard>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
        <h2 className="text-base font-semibold text-foreground mb-4 pb-3 border-b border-default">
          Rincian Gaji
        </h2>
        <DetailTable>
          <DetailTableBody>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Gaji Pokok
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.baseSalary)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Tunjangan
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.allowances)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Lembur
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.overtimeTotal)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Apresiasi
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.appreciationTotal)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Potongan
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.deductions)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Potongan Pinjaman
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.loanDeduction)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Potongan Terlambat ({payroll.lateMinutes} mnt)
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.lateDeduction)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                BPJS Kesehatan (1%)
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.bpjsHealthEmployee)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                BPJS Ketenagakerjaan (JHT+JP)
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.bpjsEmploymentEmployee)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                PPh21
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.pph21)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium text-muted-foreground">
                Potongan Tidak Hadir ({payroll.absentDays} hari bolos /{" "}
                {payroll.workingDays} hari kerja)
              </DetailTableTd>
              <DetailTableTd align="right">
                Rp {fmt(payroll.absentDeduction)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow className="border-t-2 border-default">
              <DetailTableTd className="font-semibold text-foreground">
                Gaji Bersih
              </DetailTableTd>
              <DetailTableTd
                align="right"
                className="font-semibold text-foreground"
              >
                Rp {fmt(payroll.netSalary)}
              </DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-semibold text-foreground">
                Total
              </DetailTableTd>
              <DetailTableTd
                align="right"
                className="font-semibold text-foreground"
              >
                Rp {fmt(payroll.totalAmount)}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </div>

      <PayrollBpjsAggregateSnapshot snapshot={payroll.statutorySnapshot} />

      <PayrollComponentLines
        payrollId={payroll.id}
        status={payroll.status}
        lines={payroll.componentLines.map((l) => ({
          id: l.id,
          pkwtEventId: l.pkwtEventId,
          componentId: l.componentId,
          componentNameSnapshot: l.componentNameSnapshot,
          kindSnapshot: l.kindSnapshot,
          recurrenceSnapshot: l.recurrenceSnapshot,
          isTaxableSnapshot: l.isTaxableSnapshot,
          source: l.source,
          commissionPayableId: l.commissionPayableId,
          commissionInvoiceId: l.commissionInvoiceId,
          amount: Number(l.amount),
        }))}
        components={activeComponents}
        allowances={Number(payroll.allowances)}
        deductions={Number(payroll.deductions)}
        canEdit={canEditPayroll}
      />

      <PayrollCommissionLines
        payrollId={payroll.id}
        status={payroll.status}
        debts={commissionDebts
          .map((d) => ({
            id: d.id,
            salesInvoiceId: d.salesInvoiceId,
            invoiceNo: d.salesInvoice?.documentNo ?? null,
            balance:
              Number(d.accruedAmount) - Number(d.reversalAmount) - Number(d.paidAmount),
          }))
          .filter((d) => d.balance > 0)}
        lines={payroll.componentLines
          .filter((l) => l.commissionPayableId != null)
          .map((l) => ({
            id: l.id,
            commissionPayableId: l.commissionPayableId as number,
            commissionInvoiceId: l.commissionInvoiceId,
            amount: Number(l.amount),
          }))}
        canEdit={canEditPayroll}
      />
    </div>
  );
}
