"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { createEmployeeLoan, updateEmployeeLoan } from "@/actions/hrm.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Combobox } from "@/components/ui/combobox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface LoanFormProps {
  employees: { id: number; name: string }[];
  loan?: {
    id: number;
    employeeId: number;
    loanDate: string;
    totalAmount: number;
    monthlyInstallment: number;
    remainingAmount: number;
    status: string;
    notes?: string | null;
  };
}

export function EmployeeLoanForm({ employees, loan }: LoanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(
    loan ? String(loan.employeeId) : "",
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        const result = loan?.id
          ? await updateEmployeeLoan(loan.id, formData)
          : await createEmployeeLoan(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          loan?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/sdm/pinjaman");
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
            <Label>Karyawan *</Label>
            <Combobox
              name="employeeId"
              value={employeeId || null}
              onChange={(key) => setEmployeeId(key ?? "")}
              placeholder="Cari karyawan..."
              options={employees.map((e) => ({
                value: String(e.id),
                label: e.name,
              }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal Pinjaman *"
              name="loanDate"
              defaultValue={loan?.loanDate ?? ""}
              onChange={() => {}}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalAmount">Jumlah Pinjaman (Rp) *</Label>
            <CurrencyInput
              id="totalAmount"
              name="totalAmount"
              placeholder="0"
              required
              defaultValue={loan?.totalAmount}
              prefix="Rp"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyInstallment">Cicilan per Bulan (Rp) *</Label>
            <CurrencyInput
              id="monthlyInstallment"
              name="monthlyInstallment"
              placeholder="0"
              required
              defaultValue={loan?.monthlyInstallment}
              prefix="Rp"
            />
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Catatan pinjaman..."
              defaultValue={loan?.notes ?? ""}
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : loan?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
