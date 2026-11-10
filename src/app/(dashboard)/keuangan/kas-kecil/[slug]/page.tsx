export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { formatDate, formatCurrencyExact } from "@/lib/utils/format";
import { statusLabel } from "@/lib/utils/status-labels";
import { notFound } from "next/navigation";
import { VoidButton } from "@/components/ui/void-button";
import { deletePettyCash } from "@/actions/finance.actions";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DetailCard, DetailField } from "@/components/ui/detail-card";
import { TransactionAttachments } from "@/components/ui/transaction-attachments";
import {
  Pencil,
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
} from "@/components/ui/fontawesome-icons";
import { StatusChip } from "@/components/ui/status-chip";

import type { Metadata } from "next";

import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
import { entityEditHref } from "@/lib/utils/entity-url";
import { CanCreate } from "@/components/auth/can-create";
export const metadata: Metadata = { title: "Kas Kecil" };

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("view_petty_cash");

  // delete_petty_cash memakai VoidButton (aksi void beralasan), jadi izinnya
  // dihitung di sini dan dioper sebagai canVoid.
  const canVoidPettyCash = await hasPermission("delete_petty_cash");

  const { slug } = await params;

  const pettyCash = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.pettyCash.findFirst({
        where: { slug: s, ...where },
        include: {
          project: { select: { id: true, name: true, documentNo: true } },
          vendor: { select: { name: true } },
          category: { select: { label: true } },
        },
      }),
      byId: (id, where) => prisma.pettyCash.findUnique({
        where: { id, ...where },
        include: {
          project: { select: { id: true, name: true, documentNo: true } },
          vendor: { select: { name: true } },
          category: { select: { label: true } },
        },
      }),
    },
  );

  if (!pettyCash) notFound();

  // GL-BR-003 P6: record ber-jurnal POSTED BEKU total — updatePettyCash
  // menolaknya lebih dulu sebelum mutasi apa pun. Setiap kas kecil lahir
  // dengan jurnal POSTED (createPettyCash → onPettyCashCreated, dan jalur
  // sinkronisasi expense), jadi tombol Ubah praktis SELALU berakhir ditolak.
  // Sembunyikan tombolnya; koreksi jalurnya pembatalan beralasan + buat baru.
  const postedJournal = await prisma.journal.findFirst({
    where: { referenceType: "PettyCash", referenceId: pettyCash.id, status: "POSTED" },
    select: { id: true, documentNo: true },
  });
  const isEditable = !postedJournal && pettyCash.status !== "void";

  const account = pettyCash.accountId
    ? await prisma.account.findUnique({
        where: { id: pettyCash.accountId },
        select: { code: true, name: true },
      })
    : null;

  const isExpense = pettyCash.type === "out" || pettyCash.type === "expense";
  const amountNumber = Number(pettyCash.amount);
  const balanceBeforeNumber = Number(pettyCash.balanceBefore);
  const balanceAfterNumber = Number(pettyCash.balanceAfter);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Kas Kecil ${pettyCash.documentNo}`}
        subtitle="Rincian mutasi kas kecil operasional beserta saldo buku dan jurnal pembukuan."
        badge={
          <div className="flex items-center gap-2">
            <StatusChip status={pettyCash.type} customLabel={statusLabel(pettyCash.type)} />
            {pettyCash.status && (
              <StatusChip status={pettyCash.status} customLabel={statusLabel(pettyCash.status)} />
            )}
          </div>
        }
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Kas Kecil", href: "/keuangan/kas-kecil" },
          { label: pettyCash.documentNo },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {isEditable && (
              <CanCreate permission="edit_petty_cash">
                <Button
                  href={entityEditHref("/keuangan/kas-kecil", pettyCash)}
                  variant="primary"
                >
                  <Pencil size={14} /> Ubah
                </Button>
              </CanCreate>
            )}
            <VoidButton
              id={pettyCash.id}
              action={deletePettyCash}
              canVoid={canVoidPettyCash}
              requireReason
              label="Batalkan"
              title={`Batalkan transaksi kas kecil ${pettyCash.documentNo}?`}
              body="Transaksi ditandai dibatalkan (void) dan jurnal aslinya dibalik, tetapi barisnya tetap tersimpan untuk jejak audit."
            />
          </div>
        }
      />

      {/* Financial Metric Strip (Antislop & Better-UI Standard) */}
      <div className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-3">
        {/* Nominal Transaksi */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {isExpense ? (
              <TrendingDown className="size-3.5 text-danger" aria-hidden="true" />
            ) : (
              <TrendingUp className="size-3.5 text-success" aria-hidden="true" />
            )}
            <span>Nominal Transaksi ({isExpense ? "Keluar" : "Masuk"})</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(amountNumber)}
          </p>
        </div>

        {/* Saldo Sebelum */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Saldo Sebelum</span>
          </div>
          <p className="mt-2 text-xl font-semibold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(balanceBeforeNumber)}
          </p>
        </div>

        {/* Saldo Setelah */}
        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Wallet className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span>Saldo Setelah</span>
          </div>
          <p className="mt-2 text-xl font-semibold tracking-tight text-foreground font-mono tabular-nums">
            {formatCurrencyExact(balanceAfterNumber)}
          </p>
        </div>
      </div>

      {/* Main Details Section */}
      <DetailCard title="Informasi Transaksi" columns={3}>
        <DetailField label="No. Dokumen" value={pettyCash.documentNo} mono />
        <DetailField label="Tipe Mutasi" value={statusLabel(pettyCash.type)} />
        <DetailField label="Tanggal Transaksi" value={formatDate(pettyCash.date)} />

        {account && (
          <DetailField
            label="Akun Pembukuan"
            value={
              <span className="font-mono text-sm">
                {account.code} - {account.name}
              </span>
            }
          />
        )}

        {pettyCash.category && (
          <DetailField label="Kategori Biaya" value={pettyCash.category.label} />
        )}

        {pettyCash.vendor && (
          <DetailField label="Penerima / Vendor" value={pettyCash.vendor.name} />
        )}

        {pettyCash.project && (
          <DetailField
            label="Proyek Terkait"
            value={`${pettyCash.project.documentNo ? `${pettyCash.project.documentNo} - ` : ""}${pettyCash.project.name}`}
          />
        )}

        {postedJournal && (
          <DetailField
            label="Status Jurnal Akuntansi"
            value={
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                <span>Terposting (Jurnal #{postedJournal.documentNo || postedJournal.id})</span>
              </span>
            }
          />
        )}

        <DetailField label="Waktu Dicatat" value={formatDate(pettyCash.createdAt)} />

        {pettyCash.description && (
          <DetailField
            label="Keterangan & Keperluan"
            value={<p className="text-pretty">{pettyCash.description}</p>}
            colSpan="full"
          />
        )}
      </DetailCard>

      {/* Attachments & Receipt Photos */}
      <TransactionAttachments
        referenceType="petty_cash"
        referenceId={pettyCash.id}
      />
    </div>
  );
}
