"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useTransition, useRef } from "react"
import { useSession } from "next-auth/react"
import { changePassword, updateProfile } from "@/actions/auth.actions"
import { User, Lock, Camera } from "lucide-react"
import { Input, Label } from "@heroui/react"
import { Button } from "@/components/ui/page-header"
import { showSuccess, showError } from "@/lib/utils/toast"

interface ProfileFormProps {
  user: { id: number; name: string; email: string; avatar: string | null }
  roles: string[]
}

export function ProfileForm({ user, roles }: ProfileFormProps) {
  const router = useRouter()
  const { update } = useSession()
  const [isPending, startTransition] = useTransition()
  const [avatarUrl, setAvatarUrl] = useState(user.avatar)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append("avatar", file)
    formData.append("userId", String(user.id))

    try {
      const res = await fetch("/api/upload/avatar", { method: "POST", body: formData })
      const data = await res.json()
      if (res.ok) {
        setAvatarUrl(data.url)
        await update({ name: user.name, image: data.url })
        router.refresh()
        showSuccess("Foto profil berhasil diperbarui!")
      } else {
        showError(data.error || "Upload gagal")
      }
    } catch (err) {
      showError("Upload gagal: " + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function onSubmitProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const formData = new FormData(e.currentTarget)
      const result = await updateProfile(formData)
      if (result.error) {
        showError(result.error)
      } else {
        const name = formData.get("name") as string
        const email = formData.get("email") as string
        await update({ name, email })
        router.refresh()
        showSuccess("Profil berhasil diperbarui!")
      }
    })
  }

  function onSubmitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      const formData = new FormData(e.currentTarget)
      const result = await changePassword(formData)
      if (result.error) {
        showError(result.error)
      } else {
        showSuccess("Password berhasil diubah!")
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <form onSubmit={onSubmitProfile} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="profile-top">
          <div className="profile-avatar-upload" onClick={() => fileInputRef.current?.click()}>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt="Avatar"
                width={96}
                height={96}
                className="profile-avatar-img"
                unoptimized
              />
            ) : (
              <div className="profile-avatar-large">
                {user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="profile-avatar-overlay">
              <Camera size={20} />
            </div>
            {uploading && <div className="profile-avatar-loading">...</div>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            style={{ display: "none" }}
          />
          <div className="profile-top-info">
            <h2 className="profile-name">{user.name}</h2>
            <p className="profile-email">{user.email}</p>
            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
              {roles.map((role) => (
                <span key={role} className="role-badge">{role}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="profile-divider" />

        <h3 style={{ margin: "0 0 16px", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <User size={16} /> Informasi Akun
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" name="name" defaultValue={user.name} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={user.email} required />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="submit" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </form>

      <form onSubmit={onSubmitPassword} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <h3 style={{ margin: "0 0 16px", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <Lock size={16} /> Ubah Password
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Password Lama</Label>
            <Input id="currentPassword" name="currentPassword" type="password" placeholder="••••••••" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Password Baru</Label>
            <Input id="newPassword" name="newPassword" type="password" placeholder="Minimal 8 karakter" required minLength={8} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="submit" isDisabled={isPending}>
            {isPending ? "Mengubah..." : "Ubah Password"}
          </Button>
        </div>
      </form>
    </div>
  )
}
