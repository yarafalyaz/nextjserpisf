export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatPeriod } from "@/lib/utils/format";
import { notFound } from "next/navigation";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { requirePermission } from "@/lib/auth/permissions";
import { CanCreate } from "@/components/auth/can-create";
import { getHrScope, hrScopeWhere } from "@/lib/auth/hr-scope";
import { Pencil } from "@/components/ui/fontawesome-icons";
import { ApprovePayrollButton } from "./_components/approve-button";
import { MarkPaidPayrollButton } from "./_components/mark-paid-button";
import { CorrectPaidPayrollButton } from "./_components/correct-paid-button";
import { PayrollBreakdownTable } from "./_components/payroll-breakdown-table";

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

  const [activeComponents, canEditPayroll, canProcessPayroll, commissionDebts] = await Promise.all([
    prisma.payrollComponent.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, recurrence: true },
    }),
    hasPermission("edit_payroll"),
    hasPermission("process_payroll"),
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

  const breakdownRows = [
    { id: "baseSalary", label: "Gaji Pokok", amount: Number(payroll.baseSalary ?? 0) },
    { id: "allowances", label: "Tunjangan", amount: Number(payroll.allowances ?? 0) },
    { id: "overtimeTotal", label: "Lembur", amount: Number(payroll.overtimeTotal ?? 0) },
    { id: "appreciationTotal", label: "Apresiasi", amount: Number(payroll.appreciationTotal ?? 0) },
    { id: "deductions", label: "Potongan", amount: Number(payroll.deductions ?? 0) },
    { id: "loanDeduction", label: "Potongan Pinjaman", amount: Number(payroll.loanDeduction ?? 0) },
    {
      id: "lateDeduction",
      label: `Potongan Terlambat (${payroll.lateMinutes} mnt)`,
      amount: Number(payroll.lateDeduction ?? 0),
    },
    {
      id: "bpjsHealthEmployee",
      label: "BPJS Kesehatan (1%)",
      amount: Number(payroll.bpjsHealthEmployee ?? 0),
    },
    {
      id: "bpjsEmploymentEmployee",
      label: "BPJS Ketenagakerjaan (JHT+JP)",
      amount: Number(payroll.bpjsEmploymentEmployee ?? 0),
    },
    { id: "pph21", label: "PPh21", amount: Number(payroll.pph21 ?? 0) },
    {
      id: "absentDeduction",
      label: `Potongan Tidak Hadir (${payroll.absentDays} hari alfa / ${payroll.workingDays} hari kerja)`,
      amount: Number(payroll.absentDeduction ?? 0),
    },
    {
      id: "netSalary",
      label: "Gaji Bersih",
      amount: Number(payroll.netSalary ?? 0),
      isHighlight: true,
    },
    {
      id: "totalAmount",
      label: "Total",
      amount: Number(payroll.totalAmount ?? 0),
      isHighlight: true,
    },
  ];

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
                {canProcessPayroll && <ApprovePayrollButton payrollId={payroll.id} />}
                <CanCreate permission="edit_payroll">
                  <Button
                    href={entityEditHref("/sdm/penggajian", payroll)}
                    variant="secondary"
                  >
                    <Pencil aria-hidden="true" size={14} /> Ubah
                  </Button>
                </CanCreate>
              </>
            )}
            {payroll.status === "approved" && canProcessPayroll && (
              <MarkPaidPayrollButton payrollId={payroll.id} />
            )}
            {payroll.status === "paid" && canProcessPayroll && (
              <CorrectPaidPayrollButton payrollId={payroll.id} />
            )}
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
        <PayrollBreakdownTable data={breakdownRows} />
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
