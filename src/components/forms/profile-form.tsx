"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useTransition, useRef } from "react"
import { useSession } from "next-auth/react"
import { changePassword, updateProfile } from "@/actions/auth.actions"
import { User, Lock, Camera } from "lucide-react"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Button } from "@/components/ui/button"
import { showSuccess, showError } from "@/lib/utils/toast"
import { apiErrorMessage } from "@/lib/utils/api-error-message"

interface ProfileFormProps {
  user: { id: number; name: string; email: string; avatar: string | null }
  roles: string[]
}

export function ProfileForm({ user, roles }: ProfileFormProps) {
  const router = useRouter()
  const { update } = useSession()
  const [isProfilePending, startProfileTransition] = useTransition()
  const [isPasswordPending, startPasswordTransition] = useTransition()
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
        showError(apiErrorMessage(data, "Upload gagal"))
      }
    } catch (err) {
      showError("Upload gagal: " + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  function onSubmitProfile(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startProfileTransition(async () => {
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

  function onSubmitPassword(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    startPasswordTransition(async () => {
      const formData = new FormData(e.currentTarget)
      const result = await changePassword(formData)
      if (result.error) {
        showError(result.error)
      } else {
        showSuccess("Kata sandi berhasil diubah!")
        ;(e.target as HTMLFormElement).reset()
      }
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <form onSubmit={onSubmitProfile} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="profile-top">
          <div
            className="profile-avatar-upload"
            role="button"
            tabIndex={0}
            aria-label="Ubah avatar"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
          >
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
            {/* `.profile-email` (globals.css) memakai --text-muted = 2.56:1 di latar putih.
                Kelas legacy unlayered tak bisa dikalahkan utility Tailwind, jadi warna
                ditimpa inline dengan --muted-foreground (7.58:1 terang / 6.72:1 gelap). */}
            <p className="profile-email" style={{ color: "var(--muted-foreground)" }}>{user.email}</p>
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
            <p className="text-xs text-muted-foreground">Ganti email wajib isi kata sandi saat ini.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profileCurrentPassword">Kata Sandi Saat Ini (wajib bila ganti email)</Label>
            <Input id="profileCurrentPassword" name="currentPassword" type="password" placeholder="••••••••" autoComplete="current-password" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="submit" isDisabled={isProfilePending}>
            {isProfilePending ? "Menyimpan..." : "Simpan Perubahan"}
          </Button>
        </div>
      </form>

      <form onSubmit={onSubmitPassword} className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <h3 style={{ margin: "0 0 16px", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <Lock size={16} /> Ubah Kata Sandi
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Kata Sandi Lama</Label>
            <Input id="currentPassword" name="currentPassword" type="password" placeholder="••••••••" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Kata Sandi Baru</Label>
            <Input id="newPassword" name="newPassword" type="password" placeholder="Minimal 12 karakter" required minLength={12} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="submit" isDisabled={isPasswordPending}>
            {isPasswordPending ? "Mengubah..." : "Ubah Kata Sandi"}
          </Button>
        </div>
      </form>
    </div>
  )
}
