
## 2026-05-31 09:16 WIB
- Run: e2e/crud-surface.spec.ts
- Temuan: flaky link picker sempat membuka href non-ID → Prisma findUnique id missing (assetCategory/vehicleBrand) di surface check.
- Fix: filter detail href ke pola /<base>/<id>(/ubah) sebelum navigasi.
- Verifikasi: playwright chromium CRUD surface 68 passed.
