"use client"

import { useRouter } from "next/navigation"
import { useTransition, useState } from "react"
import { createUser } from "@/actions/auth.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/page-header"

interface UserCreateFormProps {
  roles: { id: number; name: string }[]
}

export function UserCreateForm({ roles }: UserCreateFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])

  const roleOptions = roles.map(r => ({
    id: String(r.id),
    label: r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }))

  function toggleRole(id: string) {
    setSelectedRoleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const formData = new FormData(e.currentTarget)
      selectedRoleIds.forEach(id => formData.append("roleIds", id))
      const result = await createUser(formData)
      if (result.error) {
        showError(result.error)
      } else {
        showSuccess("Pengguna berhasil ditambahkan!")
        router.push("/pengaturan/pengguna")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name" className="text-sm font-semibold">Nama</Label>
          <Input id="name" name="name" placeholder="Nama lengkap" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
          <Input id="email" name="email" type="email" placeholder="email@example.com" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password" className="text-sm font-semibold">Kata Sandi</Label>
          <Input id="password" name="password" type="password" placeholder="Minimal 8 karakter" required minLength={8} />
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-sm font-semibold">Peran</Label>
          <div className="p-3 border border-default rounded-lg bg-background min-h-[88px]">
            <div className="flex flex-wrap gap-3">
              {roleOptions.map(role => {
                const isSelected = selectedRoleIds.includes(role.id)
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
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
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-default">
        <Button type="button" variant="ghost" onPress={() => router.back()} isDisabled={isPending} size="lg">
          Batal
        </Button>
        <Button type="submit" variant="primary" isDisabled={isPending} size="lg">
          {isPending ? "Menyimpan..." : "Simpan Pengguna"}
        </Button>
      </div>
    </form>
  )
}
