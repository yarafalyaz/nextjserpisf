import { Plus, Percent, CheckCircle2, XCircle } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/permissions";
import Link from "next/link";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";
import { CanCreate } from "@/components/auth/can-create";
import { WithholdingTaxTable } from "./_components/withholding-tax-table";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jenis PPh" };

export default async function WithholdingTaxTypesPage() {
  await requirePermission("manage_withholding_tax");

  const types = await prisma.withholdingTaxType.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
  });

  const totalTypes = types.length;
  const activeTypes = types.filter((t) => t.isActive).length;
  const inactiveTypes = totalTypes - activeTypes;

  const serializedTypes = types.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    rate: Number(t.rate),
    isActive: t.isActive,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pengaturan", href: "/pengaturan" },
          { label: "Jenis PPh" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">
            Jenis Pemotongan PPh
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Katalog tarif dan akun hutang pajak pemotongan PPh pada faktur pembelian & tagihan pemasok.
          </p>
        </div>
        <CanCreate permission="manage_withholding_tax">
          <Link
            href="/pengaturan/pajak-potong/tambah"
            className="inline-flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm transition-all"
            id="create-withholding-tax-btn"
          >
            <Plus className="size-3.5" />
            <span>Tambah Jenis PPh</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface rounded-xl border border-default p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Tarif PPh
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-foreground mt-0.5">
              {totalTypes}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Percent className="size-5" />
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-default p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Status Aktif
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {activeTypes}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-default p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nonaktif / Diarsip
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-muted-foreground mt-0.5">
              {inactiveTypes}
            </div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <XCircle className="size-5" />
          </div>
        </div>
      </div>

      <WithholdingTaxTable data={serializedTypes} />
    </div>
  );
}
