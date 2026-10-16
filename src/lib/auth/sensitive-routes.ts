/**
 * Route pengaturan yang hanya boleh dibuka pemegang izin tertentu.
 *
 * Dulu daftar ini hardcode `super_admin` di `src/proxy.ts`, sementara action di
 * belakangnya memakai permission lain (`manage_users`, `manage_settings`) — sehingga
 * pemegang izin tersebut bisa memanggil action-nya langsung walau halamannya tertutup
 * (server action bisa di-POST). Sekarang proxy, halaman, dan action memakai ATURAN YANG
 * SAMA: permission. Super admin tetap bypass (lihat `requirePermission()`).
 *
 * Dipakai oleh `src/proxy.ts` (redirect dini) dan dikunci tes paritas
 * `src/__tests__/sensitive-route-parity.test.ts`.
 */
export const SENSITIVE_ROUTE_PERMISSIONS: ReadonlyArray<readonly [routePrefix: string, permission: string]> = [
  ["/pengaturan/pengguna", "manage_users"],
  ["/pengaturan/peran", "manage_roles"],
  ["/pengaturan/database", "manage_settings"],
  ["/pengaturan/log-aktivitas", "manage_settings"],
]
