export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { computeTrialBalance } from "@/lib/finance/trial-balance";
import { formatAccounting } from "@/lib/utils/format";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { ExportButtons } from "@/components/reports/export-buttons";
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table";
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter";
import { ReportLetterhead } from "@/components/reports/report-letterhead";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Neraca Saldo" };

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;
  // Include the whole "as of" day: new Date("YYYY-MM-DD") is midnight, so a bare
  // `lte` would drop same-day transactions (which carry a full timestamp). Other
  // reports already use end-of-day; match that here.
  const _asOf = params.date ? new Date(params.date) : new Date();
  const asOfDate = Number.isNaN(_asOf.getTime()) ? new Date() : _asOf;
  if (params.date) asOfDate.setHours(23, 59, 59, 999);

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: {
      journalEntries: {
        where: {
          journal: {
            status: { in: ["POSTED", "REVERSED"] },
            transactionDate: { lte: asOfDate },
          },
        },
      },
    },
    orderBy: { code: "asc" },
  });

  // Aggregation + debit/credit-column placement lives in computeTrialBalance
  // (unit-tested) so the Σdebit == Σkredit invariant is guarded against regression.
  const {
    lines: data,
    grandTotalDebit,
    grandTotalCredit,
    isBalanced,
  } = computeTrialBalance(
    accounts.map((acc) => ({
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      totalDebit: acc.journalEntries.reduce(
        (sum, e) => sum + Number(e.debit),
        0,
      ),
      totalCredit: acc.journalEntries.reduce(
        (sum, e) => sum + Number(e.credit),
        0,
      ),
    })),
  );

  const asOfLabel = asOfDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <AppBreadcrumbs
          items={[
            { label: "Dasbor", href: "/" },
            { label: "Laporan", href: "/laporan" },
            { label: "Neraca Saldo" },
          ]}
        />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Neraca Saldo" />
      </div>

      <div className="print:hidden">
        <ReportSingleDateFilter
          defaultDate={params.date || asOfDate.toISOString().split("T")[0]}
        />
      </div>

      {/* Professional letterhead (screen + print) */}
      <ReportLetterhead
        title="Neraca Saldo"
        subtitle="Trial Balance"
        periodLabel={`Per ${asOfLabel}`}
      />

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-4 px-5">
          <div className="overflow-x-auto">
            <DetailTable data-report-table="Neraca Saldo">
              <DetailTableHead>
                <DetailTableTh>Kode Akun</DetailTableTh>
                <DetailTableTh>Nama Akun</DetailTableTh>
                <DetailTableTh>Tipe</DetailTableTh>
                <DetailTableTh align="right">Debit (Rp)</DetailTableTh>
                <DetailTableTh align="right">Kredit (Rp)</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {data.map((acc) => (
                  <DetailTableRow key={acc.id}>
                    <DetailTableTd>{acc.code}</DetailTableTd>
                    <DetailTableTd>{acc.name}</DetailTableTd>
                    <DetailTableTd>{acc.type}</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(acc.totalDebit)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(acc.totalCredit)}
                    </DetailTableTd>
                  </DetailTableRow>
                ))}
                {data.length === 0 && (
                  <DetailTableRow>
                    <DetailTableTd colSpan={5} className="text-center">
                      Tidak ada data jurnal yang sudah diposting
                    </DetailTableTd>
                  </DetailTableRow>
                )}
              </DetailTableBody>
              {data.length > 0 && (
                <DetailTableFoot>
                  <DetailTableFootRow className="font-bold border-t-2 border-default">
                    <DetailTableTd colSpan={3}>TOTAL</DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(grandTotalDebit)}
                    </DetailTableTd>
                    <DetailTableTd align="right">
                      {formatAccounting(grandTotalCredit)}
                    </DetailTableTd>
                  </DetailTableFootRow>
                </DetailTableFoot>
              )}
            </DetailTable>
          </div>
        </div>
      </div>

      {/* Balance Check */}
      <div
        className={`bg-surface rounded-xl p-5 px-6 flex items-center gap-4 shadow-sm border no-break ${isBalanced ? "border-success" : "border-danger"}`}
      >
        <div
          className={`text-xl font-bold ${isBalanced ? "text-success" : "text-danger"}`}
        >
          {isBalanced ? "SEIMBANG" : "TIDAK SEIMBANG"}
        </div>
        <div className="text-[0.8125rem] text-muted-foreground font-medium">
          Total Debit: {formatAccounting(grandTotalDebit, { showSymbol: true })}{" "}
          | Total Kredit:{" "}
          {formatAccounting(grandTotalCredit, { showSymbol: true })}
        </div>
      </div>
    </div>
  );
}
