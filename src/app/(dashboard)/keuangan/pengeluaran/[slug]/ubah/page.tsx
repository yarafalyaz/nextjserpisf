export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/forms/expense-form";
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs";

import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/permissions";
import { resolveEntity } from "@/lib/utils/resolve-entity";
export const metadata: Metadata = { title: "Ubah Pengeluaran" };

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requirePermission("edit_expenses");

  const { slug } = await params;

  const data = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.expense.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.expense.findUnique({ where: { id } }),
    },
  );

  if (!data) notFound();

  const [accounts, projects, categories, vendors] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentNo: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, label: true },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Keuangan", href: "/keuangan" },
          { label: "Biaya", href: "/keuangan/pengeluaran" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah</h1>
      </div>
      <ExpenseForm
        expense={{
          id: data.id,
          date: data.date.toISOString().split("T")[0],
          description: data.description,
          amount: Number(data.amount),
          accountId: data.accountId,
          paidFromAccountId: data.paidFromAccountId,
          categoryId: data.categoryId,
          costCenterId: data.costCenterId,
          projectId: data.projectId,
          vendorId: data.vendorId,
          referenceNo: data.referenceNo,
          receiptImage: data.receiptImage,
        }}
        accounts={accounts}
        categories={categories}
        projects={projects}
        vendors={vendors}
      />
    </div>
  );
}
