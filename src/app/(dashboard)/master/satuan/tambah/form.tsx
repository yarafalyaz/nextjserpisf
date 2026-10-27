"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { showSuccess, showError } from "@/lib/utils/toast";
import { createUom, updateUom } from "@/actions/master.actions";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Button } from "@/components/ui/button";

export function UomForm({
  uom,
}: {
  uom?: { id?: number; name?: string | null; symbol?: string | null; category?: string | null };
} = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = uom?.id
          ? await updateUom(uom.id, formData)
          : await createUom(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          uom?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan",
        );
        router.push("/master/satuan");
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama Satuan *</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Contoh: Kilogram"
            defaultValue={uom?.name || ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="symbol">Simbol *</Label>
          <Input
            id="symbol"
            name="symbol"
            required
            placeholder="Contoh: kg"
            defaultValue={uom?.symbol || ""}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Jenis *</Label>
          <select
            id="category"
            name="category"
            required
            defaultValue={uom?.category || "barang"}
            className="form-input"
          >
            <option value="barang">Barang</option>
            <option value="jasa">Jasa</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button className="w-full sm:w-auto" type="button" onPress={() => router.back()}>
          Batal
        </Button>
        <Button className="w-full sm:w-auto" type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : uom?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
