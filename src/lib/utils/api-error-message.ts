/**
 * Baca pesan error dari body respons API.
 *
 * Kontrak server (lihat `src/lib/api-response.ts`): kegagalan selalu
 * `{ error: { code, message } }`. Klien yang membaca `data.error` langsung
 * sebagai string mendapat object — `showError(data.error)` lalu menampilkan
 * "[object Object]" dan pesan aslinya (mis. "Akses ditolak", "Format file
 * tidak didukung") hilang. Pakai helper ini di setiap titik fetch API supaya
 * bentuk kontrak dibaca di SATU tempat.
 *
 * Bentuk warisan `{ error: "<string>" }` tetap dibaca sebagai string, supaya
 * endpoint lama yang belum migrasi tidak ikut rusak.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: unknown }).error
    if (typeof err === "string" && err.trim()) return err
    if (err && typeof err === "object") {
      const message = (err as { message?: unknown }).message
      if (typeof message === "string" && message.trim()) return message
    }
  }
  return fallback
}
