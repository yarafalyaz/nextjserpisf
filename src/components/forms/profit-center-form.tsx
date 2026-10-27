"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

// Satu-satunya UI yang memanggil createProfitCenter/updateProfitCenter. Sebelumnya
// model `ProfitCenter` tidak punya jalur tulis sama sekali, sehingga laporan pusat
// laba selalu menumpuk di "Tanpa Pusat Laba".

export function ProfitCenterForm({
  center,
}: { center?: { id: number; code: string; name: string } } = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        const { createProfitCenter, updateProfitCenter } = await import(
          "@/actions/finance.actions"
        );
        const result = center?.id
          ? await updateProfitCenter(center.id, formData)
          : await createProfitCenter(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          center?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/keuangan/pusat-laba");
        router.refresh();
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data");
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={center?.id ? "Formulir ubah pusat laba" : "Formulir tambah pusat laba"}
    >
      <FormCard>
        <FormSection title="Informasi Umum" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">
              Kode <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="code"
              name="code"
              placeholder="Contoh: PC-01"
              required
              defaultValue={center?.code ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Nama <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Nama pusat laba"
              required
              defaultValue={center?.name ?? ""}
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : center?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
