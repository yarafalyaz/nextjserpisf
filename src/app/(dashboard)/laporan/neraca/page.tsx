export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
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
} from "@/components/ui/detail-table";
import { ReportSingleDateFilter } from "@/components/reports/report-date-filter";
import { ReportLetterhead } from "@/components/reports/report-letterhead";
import { ReportSection } from "@/components/reports/report-section";
import { ReportNarration } from "@/components/reports/report-narration";
import { computeBalanceSheet } from "@/lib/finance/balance-sheet";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Neraca" };

export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission("view_reports");
  const params = await searchParams;
  const _asOf = params.date ? new Date(params.date) : new Date();
  const asOfDate = Number.isNaN(_asOf.getTime()) ? new Date() : _asOf;
  if (params.date) asOfDate.setHours(23, 59, 59, 999);

  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: {
        status: { in: ["POSTED", "REVERSED"] },
        transactionDate: { lte: asOfDate },
      },
    },
    include: { account: true },
  });

  const {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced,
  } = computeBalanceSheet(
    entries.map((e) => ({
      accountId: e.accountId,
      accountName: e.account.name,
      accountCode: e.account.code,
      accountType: e.account.type,
      debit: Number(e.debit),
      credit: Number(e.credit),
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
            { label: "Neraca" },
          ]}
        />
      </div>

      <div className="flex items-center justify-end print:hidden">
        <ExportButtons title="Neraca" />
      </div>

      <div className="print:hidden">
        <ReportSingleDateFilter
          defaultDate={params.date || asOfDate.toISOString().split("T")[0]}
        />
      </div>

      <ReportLetterhead
        title="Neraca"
        subtitle="Laporan Posisi Keuangan"
        periodLabel={`Per ${asOfLabel}`}
      />

      <ReportNarration
        text={`Laporan Neraca menyajikan posisi keuangan perusahaan per ${asOfLabel}. Laporan ini terdiri dari tiga komponen utama: Aset (sumber daya ekonomi yang dimiliki perusahaan), Kewajiban (pendanaan dari pihak ketiga), dan Ekuitas (hak residual pemilik). Berdasarkan data keuangan, total aset tercatat sebesar ${formatAccounting(totalAssets, { showSymbol: true })} yang dibiayai oleh kewajiban sebesar ${formatAccounting(totalLiabilities, { showSymbol: true })} dan ekuitas sebesar ${formatAccounting(totalEquity, { showSymbol: true })}. Neraca dinyatakan ${isBalanced ? "seimbang (balance)" : "belum seimbang — harap periksa kembali pencatatan transaksi"} sesuai dengan persamaan akuntansi: Aset = Kewajiban + Ekuitas.`}
      />

      <ReportSection title="Aset">
        <DetailTable data-report-table="Aset">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Nama Akun</DetailTableTh>
            <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {assets.map((a) => (
              <DetailTableRow key={a.code}>
                <DetailTableTd>{a.code}</DetailTableTd>
                <DetailTableTd>{a.name}</DetailTableTd>
                <DetailTableTd align="right">
                  {formatAccounting(a.balance)}
                </DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd colSpan={2}>Total Aset</DetailTableTd>
              <DetailTableTd align="right">
                {formatAccounting(totalAssets)}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Kewajiban">
        <DetailTable data-report-table="Kewajiban">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Nama Akun</DetailTableTh>
            <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {liabilities.map((a) => (
              <DetailTableRow key={a.code}>
                <DetailTableTd>{a.code}</DetailTableTd>
                <DetailTableTd>{a.name}</DetailTableTd>
                <DetailTableTd align="right">
                  {formatAccounting(a.balance)}
                </DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd colSpan={2}>Total Kewajiban</DetailTableTd>
              <DetailTableTd align="right">
                {formatAccounting(totalLiabilities)}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Ekuitas">
        <DetailTable data-report-table="Ekuitas">
          <DetailTableHead>
            <DetailTableTh>Kode</DetailTableTh>
            <DetailTableTh>Nama Akun</DetailTableTh>
            <DetailTableTh align="right">Saldo (Rp)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {equity.map((a) => (
              <DetailTableRow key={a.code}>
                <DetailTableTd>{a.code}</DetailTableTd>
                <DetailTableTd>{a.name}</DetailTableTd>
                <DetailTableTd align="right">
                  {formatAccounting(a.balance)}
                </DetailTableTd>
              </DetailTableRow>
            ))}
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd colSpan={2}>Total Ekuitas</DetailTableTd>
              <DetailTableTd align="right">
                {formatAccounting(totalEquity)}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
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
            Aset: {formatAccounting(totalAssets, { showSymbol: true })} |
            Kewajiban + Ekuitas:{" "}
            {formatAccounting(totalLiabilities + totalEquity, { showSymbol: true })}
          </div>
        </div>
      </div>
    </div>
  );
}
