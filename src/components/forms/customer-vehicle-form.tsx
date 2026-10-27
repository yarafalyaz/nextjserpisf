"use client";

import { useRouter } from "next/navigation";
import { useTransition, useMemo, useState } from "react";
import {
  createCustomerVehicle,
  updateCustomerVehicle,
} from "@/actions/vehicle.actions";
import { showSuccess, showError } from "@/lib/utils/toast";
import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Combobox } from "@/components/ui/combobox";
import {
  FormCard,
  FormSection,
  FormActions,
} from "@/components/ui/form-section";
import { Button } from "@/components/ui/button";

interface Brand {
  id: number;
  name: string;
  models: {
    id: number;
    name: string;
    variants: { id: number; name: string }[];
  }[];
}

interface VehicleData {
  id: number;
  vehicleId: number;
  brandId: number | null;
  modelId: number | null;
  variantId: number | null;
  plateNumber: string;
  year: number | null;
  color: string;
  chassisNumber: string;
  engineNumber: string;
  isActive: boolean;
  notes: string;
}

interface CustomerVehicleFormProps {
  /** Pinned owner. When omitted, a customer picker is shown instead. */
  customerId?: number;
  brands: Brand[];
  customers?: { id: number; name: string }[];
  vehicle?: VehicleData;
  /** Where to navigate after a successful save. Defaults to the pinned
   * customer's vehicle list (or the registry when adding without a pin). */
  redirectTo?: string;
}

export function CustomerVehicleForm({
  customerId,
  brands,
  customers,
  vehicle,
  redirectTo,
}: CustomerVehicleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(
    vehicle?.brandId || null,
  );
  const [selectedModelId, setSelectedModelId] = useState<number | null>(
    vehicle?.modelId || null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    vehicle?.variantId || null,
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    customerId ?? null,
  );
  const [isActive, setIsActive] = useState(vehicle?.isActive ?? true);

  // A picker is shown only when the owner is not pinned (standalone "add" flow).
  const showCustomerPicker = customerId == null;

  const models = useMemo(() => {
    if (!selectedBrandId) return [];
    const brand = brands.find((b) => b.id === selectedBrandId);
    return brand?.models || [];
  }, [selectedBrandId, brands]);

  const variants = useMemo(() => {
    if (!selectedModelId) return [];
    const model = models.find((m) => m.id === selectedModelId);
    return model?.variants || [];
  }, [selectedModelId, models]);

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const form = e.currentTarget;
        const formData = new FormData(form);

        const ownerId = customerId ?? selectedCustomerId;
        if (!ownerId) {
          showError("Pilih pelanggan terlebih dahulu");
          return;
        }
        formData.set("customerId", String(ownerId));
        formData.set("isActive", isActive ? "true" : "false");

        if (!selectedVariantId) {
          showError("Pilih varian kendaraan");
          return;
        }

        formData.set("variantId", String(selectedVariantId));

        const result = vehicle?.id
          ? await updateCustomerVehicle(vehicle.id, formData)
          : await createCustomerVehicle(formData);
        if (result && !result.success) {
          showError(result.error || "Gagal menyimpan data");
          return;
        }
        showSuccess(
          vehicle?.id
            ? "Kendaraan berhasil diperbarui"
            : "Kendaraan berhasil ditambahkan",
        );
        router.push(redirectTo ?? `/master/pelanggan/${ownerId}/kendaraan`);
        router.refresh();
      } catch (error) {
        showError(
          error instanceof Error ? error.message : "Gagal menyimpan data",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={isPending} aria-label={vehicle?.id ? "Formulir ubah kendaraan pelanggan" : "Formulir tambah kendaraan pelanggan"}>
      <FormCard>
        {showCustomerPicker && (
          <FormSection title="Pemilik">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerId">Pelanggan <span className="text-destructive" aria-hidden="true">*</span></Label>
              <Combobox
                id="customerId"
                value={selectedCustomerId ? String(selectedCustomerId) : null}
                onChange={(key) => setSelectedCustomerId(key ? Number(key) : null)}
                placeholder="Cari pelanggan..."
                options={(customers ?? []).map((c) => ({
                  value: String(c.id),
                  label: c.name,
                }))}
              />
            </div>
          </FormSection>
        )}
        <FormSection title="Informasi Kendaraan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brandId">Merek Kendaraan <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Combobox
              id="brandId"
              value={selectedBrandId ? String(selectedBrandId) : null}
              onChange={(key) => {
                setSelectedBrandId(key ? Number(key) : null);
                setSelectedModelId(null);
                setSelectedVariantId(null);
              }}
              placeholder="Cari merek..."
              options={brands.map((brand) => ({
                value: String(brand.id),
                label: brand.name,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modelId">Model Kendaraan <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Combobox
              id="modelId"
              value={selectedModelId ? String(selectedModelId) : null}
              onChange={(key) => {
                setSelectedModelId(key ? Number(key) : null);
                setSelectedVariantId(null);
              }}
              disabled={!selectedBrandId}
              placeholder="Cari model..."
              options={models.map((model) => ({
                value: String(model.id),
                label: model.name,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="variantId">Varian <span className="text-destructive" aria-hidden="true">*</span></Label>
            <Combobox
              id="variantId"
              required
              value={selectedVariantId ? String(selectedVariantId) : null}
              onChange={(key) => setSelectedVariantId(key ? Number(key) : null)}
              disabled={!selectedModelId}
              placeholder="Cari varian..."
              options={variants.map((variant) => ({
                value: String(variant.id),
                label: variant.name,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plateNumber">Plat Nomor</Label>
            <Input
              id="plateNumber"
              name="plateNumber"
              defaultValue={vehicle?.plateNumber || ""}
              placeholder="B 1234 ABC"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="year">Tahun</Label>
            <Input
              id="year"
              name="year"
              type="number"
              defaultValue={vehicle?.year || ""}
              placeholder="2024"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="color">Warna</Label>
            <Input
              id="color"
              name="color"
              defaultValue={vehicle?.color || ""}
              placeholder="Hitam"
            />
          </div>
        </FormSection>

        <FormSection title="Detail Teknis">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chassisNumber">No. Rangka</Label>
            <Input
              id="chassisNumber"
              name="chassisNumber"
              defaultValue={vehicle?.chassisNumber || ""}
              placeholder="Nomor rangka"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="engineNumber">No. Mesin</Label>
            <Input
              id="engineNumber"
              name="engineNumber"
              defaultValue={vehicle?.engineNumber || ""}
              placeholder="Nomor mesin"
            />
          </div>
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={vehicle?.notes || ""}
              rows={3}
              placeholder="Catatan tambahan..."
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="isActive">Aktif</Label>
          </div>
        </FormSection>

        <FormActions>
          <Button type="button" onPress={() => router.back()}>
            Batal
          </Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : vehicle?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  );
}
