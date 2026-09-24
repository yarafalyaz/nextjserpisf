export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma"
import { sumEntriesByAccount } from "@/lib/services/report-aggregation.service";
import { requirePermission } from "@/lib/auth/permissions";
import { computeTrialBalance } from "@/lib/finance/trial-balance";
import { formatAccounting } from "@/lib/utils/format";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
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
import { ReportSection } from "@/components/reports/report-section";
import { ReportNarration } from "@/components/reports/report-narration";
import { AppDatePicker } from "@/components/ui/date-picker";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Neraca Saldo" };

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; pembanding?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;
  const _asOf = params.date ? new Date(params.date) : new Date();
  const asOfDate = Number.isNaN(_asOf.getTime()) ? new Date() : _asOf;
  if (params.date) asOfDate.setHours(23, 59, 59, 999);

  const _cmp = params.pembanding ? new Date(params.pembanding) : null;
  const compareDate = _cmp && !Number.isNaN(_cmp.getTime()) ? _cmp : null;
  if (compareDate) compareDate.setHours(23, 59, 59, 999);

  const [accounts, asOfSums] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
    // Totalled in SQL. Previously every matching journal line for every account was
    // materialised in Node just to add up debit/credit.
    sumEntriesByAccount({ date: { lte: asOfDate } }),
  ]);

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
      totalDebit: asOfSums.get(acc.id)?.debit ?? 0,
      totalCredit: asOfSums.get(acc.id)?.credit ?? 0,
    })),
  );

  const asOfLabel = asOfDate.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const narrative = `Laporan Neraca Saldo menyajikan saldo setiap akun buku besar per ${asOfLabel}. Laporan ini berfungsi sebagai alat verifikasi untuk memastikan bahwa total debit sama dengan total kredit sebelum penyusunan laporan keuangan. Total debit tercatat sebesar ${formatAccounting(grandTotalDebit, { showSymbol: true })} dan total kredit sebesar ${formatAccounting(grandTotalCredit, { showSymbol: true })} — dinyatakan ${isBalanced ? "seimbang" : "belum seimbang"}.`

  type CmpRow = { id: number; code: string; name: string; net1: number; net2: number };
  let comparison: CmpRow[] | null = null;
  if (compareDate) {
    const compareSums = await sumEntriesByAccount({ date: { lte: compareDate } });
    comparison = accounts
      .map((a) => {
        const net1 = (asOfSums.get(a.id)?.debit ?? 0) - (asOfSums.get(a.id)?.credit ?? 0);
        const net2 = (compareSums.get(a.id)?.debit ?? 0) - (compareSums.get(a.id)?.credit ?? 0);
        return { id: a.id, code: a.code, name: a.name, net1, net2 };
      })
      .filter((r) => r.net1 !== 0 || r.net2 !== 0);
  }

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

      <ReportLetterhead
        title="Neraca Saldo"
        subtitle="Trial Balance"
        periodLabel={`Per ${asOfLabel}`}
      />
      <ReportNarration text={narrative} />
      <ReportSection title="Neraca Saldo">
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
                <DetailTableTd align="right">{formatAccounting(acc.totalDebit)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(acc.totalCredit)}</DetailTableTd>
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
                <DetailTableTd align="right">{formatAccounting(grandTotalDebit)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(grandTotalCredit)}</DetailTableTd>
              </DetailTableFootRow>
            </DetailTableFoot>
          )}
        </DetailTable>
      </ReportSection>

      {/* Balance Check */}
      <div
        className={`report-section ${isBalanced ? "border-success" : "border-danger"}`}
        style={{ borderLeft: "4px solid", paddingLeft: 16 }}
      >
        <div className="flex items-center gap-4">
          <div className={`text-sm font-bold ${isBalanced ? "text-success" : "text-danger"}`}>
            {isBalanced ? "SEIMBANG" : "TIDAK SEIMBANG"}
          </div>
          <div className="text-xs text-muted-foreground">
            Total Debit: {formatAccounting(grandTotalDebit, { showSymbol: true })} |
            Total Kredit: {formatAccounting(grandTotalCredit, { showSymbol: true })}
          </div>
        </div>
      </div>

      <ReportSection title="Perbandingan Periode">
        <form className="flex items-end gap-4 flex-wrap print:hidden" action="/laporan/neraca-saldo">
          <input type="hidden" name="date" value={params.date || asOfDate.toISOString().split("T")[0]} />
          <AppDatePicker
            label="Bandingkan dengan tanggal"
            name="pembanding"
            defaultValue={params.pembanding || ""}
            className="w-[180px]"
          />
          <Button type="submit" variant="primary">Bandingkan</Button>
        </form>
        {!comparison ? (
          <p className="text-sm text-muted-foreground">
            Pilih tanggal pembanding untuk melihat perubahan saldo bersih tiap akun antar dua periode.
          </p>
        ) : (
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
                const diff = r.net1 - r.net2;
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
                );
              })}
              {comparison.length === 0 && (
                <DetailTableRow>
                  <DetailTableTd colSpan={5} className="text-center">Tidak ada saldo pada kedua periode</DetailTableTd>
                </DetailTableRow>
              )}
            </DetailTableBody>
          </DetailTable>
        )}
      </ReportSection>
    </div>
  );
}
