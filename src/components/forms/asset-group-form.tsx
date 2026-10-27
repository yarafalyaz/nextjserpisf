"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

// Satu-satunya UI yang memanggil createAssetGroup/updateAssetGroup. Sebelumnya model
// `AssetGroup` tidak punya jalur tulis sama sekali, sehingga pilihan "Grup Aset" di
// form aset selalu kosong.

export function AssetGroupForm({
  group,
}: { group?: { id: number; name: string } } = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget);
        const { createAssetGroup, updateAssetGroup } = await import("@/actions/asset.actions");
        const result = group?.id
          ? await updateAssetGroup(group.id, formData)
          : await createAssetGroup(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(group?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan");
        router.push("/aset/grup");
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
      aria-label={group?.id ? "Formulir ubah grup aset" : "Formulir tambah grup aset"}
    >
      <FormCard>
        <FormSection title="Informasi Umum" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">
              Nama <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Contoh: Kendaraan Operasional"
              required
              defaultValue={group?.name ?? ""}
            />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : group?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
