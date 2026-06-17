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
  searchParams: Promise<{ date?: string; pembanding?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;
  // Include the whole "as of" day: new Date("YYYY-MM-DD") is midnight, so a bare
  // `lte` would drop same-day transactions (which carry a full timestamp). Other
  // reports already use end-of-day; match that here.
  const _asOf = params.date ? new Date(params.date) : new Date();
  const asOfDate = Number.isNaN(_asOf.getTime()) ? new Date() : _asOf;
  if (params.date) asOfDate.setHours(23, 59, 59, 999);

  // Optional comparative ("pembanding") date — when set, render a side-by-side
  // net-balance comparison of the two periods.
  const _cmp = params.pembanding ? new Date(params.pembanding) : null;
  const compareDate = _cmp && !Number.isNaN(_cmp.getTime()) ? _cmp : null;
  if (compareDate) compareDate.setHours(23, 59, 59, 999);

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

  // Build the comparative net-balance table when a second date is provided.
  // Net = Σdebit − Σcredit per account (sign-based), so a single number per
  // period is comparable. We re-fetch the second period's entries.
  type CmpRow = { id: number; code: string; name: string; net1: number; net2: number };
  let comparison: CmpRow[] | null = null;
  if (compareDate) {
    const accounts2 = await prisma.account.findMany({
      where: { isActive: true },
      include: {
        journalEntries: {
          where: {
            journal: {
              status: { in: ["POSTED", "REVERSED"] },
              transactionDate: { lte: compareDate },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });
    const net2Map = new Map(
      accounts2.map((a) => [
        a.id,
        a.journalEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0),
      ]),
    );
    comparison = accounts
      .map((a) => {
        const net1 = a.journalEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0);
        const net2 = net2Map.get(a.id) ?? 0;
        return { id: a.id, code: a.code, name: a.name, net1, net2 };
      })
      // Drop accounts that are zero in both periods to keep the table focused.
      .filter((r) => r.net1 !== 0 || r.net2 !== 0);
  }

  const asOfLabel = asOfDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const compareLabel = compareDate
    ? compareDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : null;

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
      {/* Comparative period selector + table */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden no-break">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default flex-wrap gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Perbandingan Periode
          </h2>
          <form className="flex items-end gap-2 print:hidden" action="/laporan/neraca-saldo">
            <input type="hidden" name="date" value={params.date || asOfDate.toISOString().split("T")[0]} />
            <div className="flex flex-col gap-1">
              <label htmlFor="pembanding" className="text-xs text-muted-foreground">Bandingkan dengan tanggal</label>
              <input
                id="pembanding"
                name="pembanding"
                type="date"
                defaultValue={params.pembanding || ""}
                className="form-input h-9 rounded-md border border-default bg-background px-2 text-sm"
              />
            </div>
            <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Bandingkan</button>
          </form>
        </div>
        <div className="p-4 px-5">
          {!comparison ? (
            <p className="text-sm text-muted-foreground">
              Pilih tanggal pembanding untuk melihat perubahan saldo bersih tiap akun antar dua periode.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <DetailTable data-report-table="Perbandingan Neraca Saldo">
                <DetailTableHead>
                  <DetailTableTh>Kode</DetailTableTh>
                  <DetailTableTh>Nama Akun</DetailTableTh>
                  <DetailTableTh align="right">Saldo per {asOfLabel} (Rp)</DetailTableTh>
                  <DetailTableTh align="right">Saldo per {compareLabel} (Rp)</DetailTableTh>
                  <DetailTableTh align="right">Selisih (Rp)</DetailTableTh>
                </DetailTableHead>
                <DetailTableBody>
                  {comparison.map((r) => {
                    const diff = r.net1 - r.net2
                    return (
                      <DetailTableRow key={r.id}>
                        <DetailTableTd>{r.code}</DetailTableTd>
                        <DetailTableTd>{r.name}</DetailTableTd>
                        <DetailTableTd align="right">{formatAccounting(r.net1)}</DetailTableTd>
                        <DetailTableTd align="right">{formatAccounting(r.net2)}</DetailTableTd>
                        <DetailTableTd align="right" className={diff > 0 ? "text-success" : diff < 0 ? "text-danger" : ""}>
                          {formatAccounting(diff)}
                        </DetailTableTd>
                      </DetailTableRow>
                    )
                  })}
                  {comparison.length === 0 && (
                    <DetailTableRow>
                      <DetailTableTd colSpan={5} className="text-center">Tidak ada saldo pada kedua periode</DetailTableTd>
                    </DetailTableRow>
                  )}
                </DetailTableBody>
              </DetailTable>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
