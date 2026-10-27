/**
 * Kebijakan password untuk SEMUA jalur penetapan password (buat user,
 * ganti password, reset oleh admin, akun login karyawan, setup awal).
 *
 * Mengikuti gaya NIST SP 800-63B: utamakan panjang + tolak password yang
 * sudah umum/bocor, TANPA aturan komposisi simbol dan TANPA rotasi
 * berkala (keduanya terbukti membuat password lebih lemah di praktik).
 * Password lama yang sudah terlanjur tersimpan TIDAK dipaksa ganti di
 * login — kebijakan ini hanya berlaku saat password ditetapkan/diubah.
 */
export const PASSWORD_MIN_LENGTH = 12

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "123123",
  "111111",
  "abc123",
  "qwerty",
  "qwerty123",
  "admin",
  "admin123",
  "administrator",
  "letmein",
  "welcome",
  "welcome123",
  "changeme",
  "default",
  "iloveyou",
  "rahasia",
  "rahasia123",
  "sayang",
  "indonesia",
  "jakarta",
  "bismillah",
  "yarasoft",
  "silengkap",
  "erp12345",
  "user1234",
  "test1234",
])

export type PasswordPolicyIssue = "short" | "common"

/** Null bila lolos; kode masalah bila tidak. */
export function passwordPolicyIssue(password: string): PasswordPolicyIssue | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "short"
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "common"
  return null
}

/**
 * Pesan pengguna (Bahasa Indonesia) untuk satu password; null bila lolos.
 * `label` membedakan konteks ("Password baru" / "Kata sandi") mengikuti pola
 * pesan field di jalur pemanggil; pesan `common` sama untuk semua jalur.
 */
export function passwordPolicyError(password: string, label = "Password"): string | null {
  const issue = passwordPolicyIssue(password)
  if (issue === "short") return `${label} minimal ${PASSWORD_MIN_LENGTH} karakter`
  if (issue === "common") return "Password terlalu umum, gunakan kata sandi lain"
  return null
}
