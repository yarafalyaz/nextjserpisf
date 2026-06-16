"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface BudgetFormProps {
  accounts: { id: number; code: string; name: string }[];
  // The Budget model only carries the fields listed here. Previous versions
  // of this prop type advertised `year`, `totalAmount`, `departmentId`, and
  // `notes` — none of which exist on the Prisma model. Those prop entries
  // were a type-only lie: pages that passed them in relied on form fields
  // that were either never rendered (year) or were silently stripped by the
  // Zod schema before reaching the DB (totalAmount/notes).
  budget?: {
    id: number;
    name: string;
    amount?: number;
    accountId?: number | null;
    costCenterId?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  };
  costCenters: { id: number; code: string; name: string }[];
}

export function BudgetForm({ accounts, costCenters, budget }: BudgetFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(budget?.startDate ?? "");
  const [endDate, setEndDate] = useState(budget?.endDate ?? "");
  const [accountId, setAccountId] = useState(
    budget?.accountId ? String(budget.accountId) : "",
  );
  const [costCenterId, setCostCenterId] = useState(
    budget?.costCenterId ? String(budget.costCenterId) : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        const { createBudget, updateBudget } =
          await import("@/actions/finance.actions");
        const result = budget?.id
          ? await updateBudget(budget.id, formData)
          : await createBudget(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          budget?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/keuangan/anggaran");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama Anggaran *</Label>
            <Input
              id="name"
              name="name"
              placeholder="Nama anggaran"
              required
              defaultValue={budget?.name ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Akun *</Label>
            <Combobox
              name="accountId"
              value={accountId || null}
              onChange={(key) => setAccountId(key ?? "")}
              placeholder="Cari akun..."
              options={accounts.map((a) => ({
                value: String(a.id),
                label: `${a.code} - ${a.name}`,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Pusat Biaya</Label>
            <Combobox
              name="costCenterId"
              value={costCenterId || null}
              onChange={(key) => setCostCenterId(key ?? "")}
              placeholder="Cari pusat biaya..."
              options={costCenters.map((cc) => ({
                value: String(cc.id),
                label: `${cc.code} - ${cc.name}`,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Mulai *"
              name="startDate"
              value={startDate}
              onChange={setStartDate}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Selesai *"
              name="endDate"
              value={endDate}
              onChange={setEndDate}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (Rp) *</Label>
            <CurrencyInput
              id="amount"
              name="amount"
              placeholder="0"
              required
              defaultValue={budget?.amount}
              prefix="Rp"
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : budget?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
