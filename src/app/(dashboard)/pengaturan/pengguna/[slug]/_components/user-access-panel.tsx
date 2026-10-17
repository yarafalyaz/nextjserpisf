"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { updateUserRoles, toggleUserActive } from "@/actions/auth.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"

// Panel ini adalah SATU-SATUNYA UI yang memanggil updateUserRoles dan
// toggleUserActive. Sebelumnya kedua aksi itu lengkap (penjagaan izin, guard
// eskalasi peran, log aktivitas, tes) tetapi tidak dipanggil komponen mana pun,
// sehingga halaman detail pengguna hanya bisa MENAMPILKAN peran dan status —
// admin tidak punya cara mengubahnya dari aplikasi.

interface UserAccessPanelProps {
  userId: number
  isActive: boolean
  roles: { id: number; name: string }[]
  currentRoleIds: number[]
}

export function UserAccessPanel({ userId, isActive, roles, currentRoleIds }: UserAccessPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>(currentRoleIds)

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
    </div>
  )
}
