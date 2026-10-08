export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { AppSearchField } from "@/components/ui/search-field";
import { PettyCashTable } from "./_components/petty-cash-table";
import { formatCurrency } from "@/lib/utils/format";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kas Kecil" };

export default async function PettyCashPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; tipe?: string; halaman?: string }>;
}) {
  await requirePermission("view_petty_cash");

  const params = await searchParams;
  const page = Number(params.halaman) || 1;
  const perPage = 100;

  const where = {
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
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: { balanceAfter: true },
  });
  const currentBalance = lastRecord ? Number(lastRecord.balanceAfter) : 0;

  // Monthly summary
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthRecords = await prisma.pettyCash.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
    },
    select: { type: true, amount: true },
  });
  const monthIn = monthRecords
    .filter((r) => r.type === "IN")
    .reduce((s, r) => s + Number(r.amount), 0);
  const monthOut = monthRecords
    .filter((r) => r.type === "OUT")
    .reduce((s, r) => s + Number(r.amount), 0);

  const [records, total] = await Promise.all([
    prisma.pettyCash.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        project: { select: { name: true, documentNo: true } },
        vendor: { select: { name: true } },
        category: { select: { label: true } },
      },
    }),
    prisma.pettyCash.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  const data = records.map((r) => ({
    id: r.id,
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

  const balanceColor =
    currentBalance > 0
      ? "text-green-600"
      : currentBalance < 0
        ? "text-red-600"
        : "text-muted-foreground";

  const statusChips = (
    <>
      <Link
        href="/keuangan/kas-kecil"
        className={`filter-chip ${!params.tipe ? "active" : ""}`}
      >
        Semua
      </Link>
      <Link
        href="/keuangan/kas-kecil?tipe=masuk"
        className={`filter-chip ${params.tipe === "masuk" ? "active" : ""}`}
      >
        Masuk
      </Link>
      <Link
        href="/keuangan/kas-kecil?tipe=keluar"
        className={`filter-chip ${params.tipe === "keluar" ? "active" : ""}`}
      >
        Keluar
      </Link>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Balance + stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-xl border border-default shadow-sm p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Saldo Kas Kecil
          </p>
          <p className={`text-2xl font-bold ${balanceColor}`}>
            {formatCurrency(currentBalance)}
          </p>
        </div>
        <div className="bg-surface rounded-xl border border-default shadow-sm p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Pemasukan Bulan Ini
          </p>
          <p className="text-2xl font-bold text-green-600">
            {formatCurrency(monthIn)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{monthRecords.filter(r => r.type === "IN").length} transaksi</p>
        </div>
        <div className="bg-surface rounded-xl border border-default shadow-sm p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Pengeluaran Bulan Ini
          </p>
          <p className="text-2xl font-bold text-red-600">
            {formatCurrency(monthOut)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{monthRecords.filter(r => r.type === "OUT").length} transaksi</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Transaksi Kas Kecil</h1>
        <Link
          href="/keuangan/kas-kecil/tambah"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
          id="create-pc-btn"
        >
          + Buat Transaksi
        </Link>
      </div>

      <PettyCashTable
        data={data}
        toolbar={
          <AppSearchField
            placeholder="Cari Kas Kecil..."
            action="/keuangan/kas-kecil"
          />
        }
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 px-5 border-t border-default">
          <span className="text-[0.8125rem] text-muted-foreground">
            Hal {page} dari {totalPages} ({total} data)
          </span>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={`/keuangan/kas-kecil?halaman=${page - 1}`}
                className="button button--ghost button--sm"
              >
                ← Sebelumnya
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/keuangan/kas-kecil?halaman=${page + 1}`}
                className="button button--ghost button--sm"
              >
                Berikutnya →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
