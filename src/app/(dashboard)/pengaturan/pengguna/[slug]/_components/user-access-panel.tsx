"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { updateUserRoles, toggleUserActive, updateUserWarehouses } from "@/actions/auth.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

// Panel ini adalah SATU-SATUNYA UI yang memanggil updateUserRoles,
// toggleUserActive, dan updateUserWarehouses. Sebelumnya kedua aksi pertama itu
// lengkap (penjagaan izin, guard eskalasi peran, log aktivitas, tes) tetapi tidak
// dipanggil komponen mana pun, sehingga halaman detail pengguna hanya bisa
// MENAMPILKAN peran dan status — admin tidak punya cara mengubahnya dari aplikasi.
//
// Bagian gudang menutup hal yang berbeda: tabel `user_warehouses` TIDAK punya jalur
// tulis sama sekali, padahal `getWarehouseScope` menentukan cakupan gudang peran
// `warehouse` dari tabel itu dan MENOLAK (`{ kind: "none" }`) bila kosong. Jadi
// peran `warehouse` tidak bisa diberi akses gudang mana pun sebelum panel ini ada.

interface UserAccessPanelProps {
  userId: number
  isActive: boolean
  roles: { id: number; name: string }[]
  currentRoleIds: number[]
  warehouses: { id: number; name: string }[]
  currentWarehouseIds: number[]
  /** Peran pengguna sudah termasuk peran ber-akses-semua-gudang. */
  allWarehouseAccess: boolean
}

export function UserAccessPanel({
  userId,
  isActive,
  roles,
  currentRoleIds,
  warehouses,
  currentWarehouseIds,
  allWarehouseAccess,
}: UserAccessPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>(currentRoleIds)
  const [selectedWarehouseIds, setSelectedWarehouseIds] =
    useState<number[]>(currentWarehouseIds)

  const roleOptions = roles.map((r) => ({
    id: r.id,
    label: r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }))

  const roleDirty =
    selectedRoleIds.length !== currentRoleIds.length ||
    selectedRoleIds.some((id) => !currentRoleIds.includes(id))

  function toggleRole(id: number) {
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function saveRoles() {
    startTransition(async () => {
      const result = await updateUserRoles(userId, selectedRoleIds)
      if (result.error) {
        showError(result.error)
        return
      }
      showSuccess("Peran pengguna diperbarui")
      router.refresh()
    })
  }

  const warehouseDirty =
    selectedWarehouseIds.length !== currentWarehouseIds.length ||
    selectedWarehouseIds.some((id) => !currentWarehouseIds.includes(id))

  function toggleWarehouse(id: number) {
    setSelectedWarehouseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function saveWarehouses() {
    startTransition(async () => {
      const result = await updateUserWarehouses(userId, selectedWarehouseIds)
      if (result.error) {
        showError(result.error)
        return
      }
      showSuccess("Akses gudang diperbarui")
      router.refresh()
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await toggleUserActive(userId)
      if (result.error) {
        showError(result.error)
        return
      }
      showSuccess(isActive ? "Pengguna dinonaktifkan" : "Pengguna diaktifkan")
      router.refresh()
    })
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Akses &amp; Peran</h2>
        <p className="text-sm text-muted-foreground">
          Peran menentukan modul yang boleh dibuka pengguna ini.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Peran pengguna">
        {roleOptions.map((role) => {
          const isSelected = selectedRoleIds.includes(role.id)
          return (
            <button
              key={role.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleRole(role.id)}
              disabled={isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer disabled:opacity-60 ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface border-default hover:border-primary/50 text-foreground"
              }`}
            >
              {role.label}
            </button>
          )
        })}
      </div>

      {selectedRoleIds.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Tanpa peran, pengguna bisa masuk tetapi tidak punya akses modul apa pun.
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-2 border-t border-default">
        <Button
          type="button"
          variant="primary"
          onPress={saveRoles}
          isDisabled={isPending || !roleDirty}
        >
          {isPending ? "Menyimpan..." : "Simpan Peran"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onPress={toggleActive}
          isDisabled={isPending}
        >
          {isActive ? "Nonaktifkan Pengguna" : "Aktifkan Pengguna"}
        </Button>
      </div>

      {/* Akses gudang: hanya berpengaruh untuk peran `warehouse`. Peran lain
          (mis. admin, manajer gudang) sudah ber-akses semua gudang, jadi panel ini
          menjelaskannya alih-alih menawarkan pilihan yang tidak berpengaruh. */}
      <div className="flex flex-col gap-3 pt-4 mt-2 border-t border-default">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Akses Gudang</h3>
          <p className="text-sm text-muted-foreground">
            {allWarehouseAccess
              ? "Peran pengguna ini sudah mencakup akses ke semua gudang, jadi penugasan gudang di bawah tidak berpengaruh."
              : "Pengguna dengan peran gudang hanya dapat membuka dokumen dari gudang yang ditugaskan di sini. Tanpa penugasan, ia tidak dapat mengakses gudang mana pun."}
          </p>
        </div>

        {warehouses.length === 0 ? (
          <p className="text-xs text-muted-foreground">Belum ada gudang aktif.</p>
        ) : (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Akses gudang pengguna">
            {warehouses.map((wh) => {
              const isSelected = selectedWarehouseIds.includes(wh.id)
              return (
                <button
                  key={wh.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleWarehouse(wh.id)}
                  disabled={isPending}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer disabled:opacity-60 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-surface border-default hover:border-primary/50 text-foreground"
                  }`}
                >
                  {wh.name}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="primary"
            onPress={saveWarehouses}
            isDisabled={isPending || !warehouseDirty}
          >
            {isPending ? "Menyimpan..." : "Simpan Akses Gudang"}
          </Button>
          {selectedWarehouseIds.length > 0 && (
            <span className="self-center text-xs text-muted-foreground">
              {selectedWarehouseIds.length} gudang dipilih
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
