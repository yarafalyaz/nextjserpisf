"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AppDatePicker } from "@/components/ui/date-picker";
import { createEmployeeLoan, updateEmployeeLoan } from "@/actions/hrm.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { QuickAddSelect } from "@/components/ui/quick-add-select";
import { QUICK_ADD } from "@/lib/quick-add/registry";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface LoanFormProps {
  employees: { id: number; name: string }[];
  /** Tujuan sesudah simpan berhasil. Default daftar staf existing. */
  redirectTo?: string;
  loan?: {
    id: number;
    employeeId: number;
    loanDate: string;
    totalAmount: number;
    monthlyInstallment: number;
    weeklyInstallment?: number | null;
    remainingAmount: number;
    status: string;
    notes?: string | null;
  };
}

export function EmployeeLoanForm({ employees, loan, redirectTo = "/sdm/pinjaman" }: LoanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState(
    loan ? String(loan.employeeId) : employees.length === 1 ? String(employees[0].id) : "",
  );
  const [employeeOptions, setEmployeeOptions] = useState(employees);

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
        router.push(redirectTo);
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={loan?.id ? "Formulir ubah pinjaman karyawan" : "Formulir tambah pinjaman karyawan"}>
      <FormCard>
        <FormSection title="Informasi Umum">
          {employees.length === 1 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Karyawan <span className="text-destructive" aria-hidden="true">*</span></Label>
              <div className="px-3 py-2.5 rounded-lg border border-default bg-default/10 text-foreground font-medium text-sm">
                {employees[0].name}
              </div>
              <input type="hidden" name="employeeId" value={employees[0].id} />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Karyawan <span className="text-destructive" aria-hidden="true">*</span></Label>
              <QuickAddSelect
                name="employeeId"
                required
                value={employeeId || null}
                onChange={(key) => setEmployeeId(key ?? "")}
                placeholder="Cari karyawan..."
                options={employeeOptions.map((e) => ({
                  value: String(e.id),
                  label: e.name,
                }))}
                title={QUICK_ADD.employee.title}
                fields={QUICK_ADD.employee.fields}
                action={QUICK_ADD.employee.action}
                onCreated={(created) => {
                  setEmployeeOptions((prev) => [...prev, { id: created.id, name: created.label }]);
                  setEmployeeId(String(created.id));
                }}
              />
            </div>
          )}
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
            <Label htmlFor="totalAmount">Jumlah Pinjaman (Rp) <span className="text-destructive" aria-hidden="true">*</span></Label>
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
            <Label htmlFor="monthlyInstallment">Cicilan per Bulan (Rp) <span className="text-destructive" aria-hidden="true">*</span></Label>
            <CurrencyInput
              id="monthlyInstallment"
              name="monthlyInstallment"
              placeholder="0"
              required
              defaultValue={loan?.monthlyInstallment}
              prefix="Rp"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="weeklyInstallment">Cicilan Mingguan (Perjanjian Tertulis, Rp)</Label>
            <CurrencyInput
              id="weeklyInstallment"
              name="weeklyInstallment"
              placeholder="Opsional"
              defaultValue={loan?.weeklyInstallment}
              prefix="Rp"
              emptyAsNull
              aria-describedby="weeklyInstallment-hint"
            />
            <p id="weeklyInstallment-hint" className="text-xs text-muted-foreground">
              Opsional. Kosongkan bila belum diatur dalam perjanjian tertulis — pinjaman
              tanpa nominal mingguan menahan karyawan dari run gaji WEEKLY. Nilai tidak
              dihitung otomatis dari cicilan bulanan.
            </p>
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
