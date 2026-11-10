export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import { parsePagination } from "@/lib/utils/pagination";
import { withListParams } from "@/lib/utils/list-href";
import Link from "next/link";
import { AppSearchField } from "@/components/ui/search-field";
import { PettyCashTable } from "./_components/petty-cash-table";
import { formatCurrencyExact } from "@/lib/utils/format";
import { CanCreate } from "@/components/auth/can-create";
import { PageHeader } from "@/components/ui/page-header";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Receipt,
  RotateCcw,
  Coins,
} from "@/components/ui/fontawesome-icons";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kas Kecil" };

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; tipe?: string; halaman?: string; pageSize?: string }>;
}) {
  await requirePermission("view_petty_cash");

  const params = await searchParams;
  const { page, pageSize, take } = parsePagination(params);

  // Putaran 86: halaman hanya menampilkan rantai AKTIF (posted, tak
  // terhapus lunak) — record void tetap terdaftar sebagai mutasi aktif
  // dan record terakhir void menjadi "saldo saat ini" padahal rantai
  // aktif/GL sudah mengeluarkannya (recalcPettyCashChain excludeVoid).
  const where = {
    status: "posted",
    deletedAt: null,
    ...(params.tipe === "masuk" ? { type: "IN" } : {}),
    ...(params.tipe === "keluar" ? { type: "OUT" } : {}),
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { description: { contains: params.cari } },
      ],
    }),
  };

  // Current balance = balanceAfter of the chronologically LAST record, i.e. the
  // max (date, id) — the same canonical order the chain is maintained in
  // (recalcPettyCashChain: date asc, id asc). Ordering by `createdAt desc` could
  // surface a backdated entry (created later, dated earlier) whose balanceAfter
  // is NOT the current balance.
  const lastRecord = await prisma.pettyCash.findFirst({
    where: { status: "posted", deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: { balanceAfter: true },
  });
  const currentBalance = lastRecord ? Number(lastRecord.balanceAfter) : 0;

  // Imprest Fund Float System (Kas Kecil Sistem Dana Tetap)
  // Total dana masuk yang telah disetorkan sebagai dana kas kecil
  const totalInSum = await prisma.pettyCash.aggregate({
    where: { status: "posted", deletedAt: null, type: "IN" },
    _sum: { amount: true },
    _count: true,
  });
  const totalFunding = Number(totalInSum._sum.amount ?? 0);
  // Default plafon operasional mengacu pada total dana masuk terakhir atau saldo aktif
  const imprestCeiling = Math.max(totalFunding, currentBalance, 0);

  // Monthly summary
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthRecords = await prisma.pettyCash.findMany({
    where: {
      status: "posted",
      deletedAt: null,
      date: { gte: monthStart, lt: monthEnd },
    },
    select: { type: true, amount: true },
  });
  const inCount = monthRecords.filter((r) => r.type === "IN").length;
  const outCount = monthRecords.filter((r) => r.type === "OUT").length;
  const monthIn = monthRecords
    .filter((r) => r.type === "IN")
    .reduce((s, r) => s + Number(r.amount), 0);
  const monthOut = monthRecords
    .filter((r) => r.type === "OUT")
    .reduce((s, r) => s + Number(r.amount), 0);

  // Persentase kas fisik tersisa dibanding plafon
  const cashRemainingPercent = imprestCeiling > 0
    ? Math.min(100, Math.max(0, Math.round((currentBalance / imprestCeiling) * 100)))
    : (currentBalance > 0 ? 100 : 0);

  const [records, total] = await Promise.all([
    prisma.pettyCash.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take,
      include: {
        project: { select: { name: true, documentNo: true } },
        vendor: { select: { name: true } },
        category: { select: { label: true } },
      },
    }),
    prisma.pettyCash.count({ where }),
  ]);

  const data = records.map((r) => ({
    id: r.id,
    slug: r.slug,
    documentNo: r.documentNo,
    date: r.date.toISOString(),
    type: r.type,
    description: r.description,
    amount: Number(r.amount),
    balanceAfter: Number(r.balanceAfter),
    projectName: r.project
      ? `${r.project.documentNo ? `${r.project.documentNo} - ` : ""}${r.project.name}`
      : null,
    vendorName: r.vendor?.name ?? null,
    categoryName: r.category?.label ?? null,
  }));

  const statusChips = (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link
        href={withListParams("/keuangan/kas-kecil", params, { tipe: undefined, halaman: undefined })}
        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          !params.tipe
            ? "bg-foreground text-background font-semibold"
            : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        Semua Mutasi
      </Link>
      <Link
        href={withListParams("/keuangan/kas-kecil", params, { tipe: "keluar", halaman: undefined })}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          params.tipe === "keluar"
            ? "bg-red-600 text-white dark:bg-red-500 dark:text-zinc-950 font-semibold"
            : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Receipt className="size-3" aria-hidden="true" />
        <span>Voucher Keluar (PCV)</span>
      </Link>
      <Link
        href={withListParams("/keuangan/kas-kecil", params, { tipe: "masuk", halaman: undefined })}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          params.tipe === "masuk"
            ? "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-zinc-950 font-semibold"
            : "bg-surface border border-default text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <RotateCcw className="size-3" aria-hidden="true" />
        <span>Pengisian (Reimposisi)</span>
      </Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Kas Kecil (Petty Cash)"
        subtitle="Sistem dana kas kecil operasional (Imprest Fund System) — pencatatan voucher pengeluaran harian, reimposisi kas, dan kontrol plafon kas."
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Kas Kecil" },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CanCreate permission="create_petty_cash">
              <Link
                href="/keuangan/kas-kecil/tambah/tipe/in"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors"
                id="replenish-pc-btn"
              >
                <RotateCcw className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span>Isi / Reimposisi Kas</span>
              </Link>
              <Link
                href="/keuangan/kas-kecil/tambah/tipe/out"
                className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-2xs transition-colors"
                id="create-pc-btn"
              >
                <Plus className="size-3.5" aria-hidden="true" />
                <span>Buat Voucher Kas (PCV)</span>
              </Link>
            </CanCreate>
          </div>
        }
      />

      {/* ERP Imprest Fund Metric Strip (Unified & Non-Floating) */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4">
        {/* Plafon Kas Imprest */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Plafon Dana Kas</p>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(imprestCeiling)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalInSum._count > 0 ? `${totalInSum._count} kali pengisian tercatat` : "Sistem dana tetap aktif"}
          </p>
        </div>

        {/* Saldo Kas Fisik Aktif */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wallet className="size-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-medium text-muted-foreground">Sisa Kas Fisik Aktif</p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground tabular-nums">
              {cashRemainingPercent}%
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(currentBalance)}
          </p>
          {/* Progress bar visualisasi ketersediaan kas */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all duration-300 ${
                cashRemainingPercent < 20
                  ? "bg-red-500"
                  : cashRemainingPercent < 50
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${cashRemainingPercent}%` }}
              role="progressbar"
              aria-valuenow={cashRemainingPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Pengeluaran / Voucher Bulan Ini */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Pengeluaran Bulan Ini</p>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tracking-tight text-red-600 dark:text-red-400 font-mono tabular-nums">
              {formatCurrencyExact(monthOut)}
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {outCount} voucher
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Beban operasional harian
          </p>
        </div>

        {/* Pengisian / Reimposisi Bulan Ini */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-xs font-medium text-muted-foreground">Pengisian Bulan Ini</p>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <p className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {formatCurrencyExact(monthIn)}
            </p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {inCount} reimposisi
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Penarikan dari kas/bank
          </p>
        </div>
      </div>

      {/* Main Data Table */}
      <PettyCashTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari nomor dokumen / deskripsi / vendor..."
            action="/keuangan/kas-kecil"
          />
        }
        filters={statusChips}
      />
    </div>
  );
}
