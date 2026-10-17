# Audit Kode Mati — Silengkap / YaraERP

Ringkasan audit kode mati (dependensi, simbol, skrip, CSS, binding tes) pada
Next.js 16.3 · TypeScript · Prisma · MariaDB. Setiap vonis memakai **grep kata-utuh**
sebagai bukti, bukan opini; `knip` hanya dipakai sebagai **sinyal kandidat**.
Bagian yang sudah dieksekusi menyebut commit-nya; bagian yang belum ditandai
eksplisit **belum dieksekusi / belum terbukti**.

- **Baseline commit:** `3619af65` (ujung rantai commit kode mati)
- **Bahan mentah:** `/tmp/knip-compact.txt`, `/tmp/t1-export-audit.md`, `/tmp/t2-scripts-audit.md`,
  `/tmp/w2-dead-symbols.md`, `/tmp/w2-scripts-final.md`, `/tmp/w2-css-dead.md`,
  `/tmp/w2-silent-verified.md`, `/tmp/w2-i18n-verified.md`, `/tmp/t4-e2e-parity.md`

---

## Metode

1. **`knip` = sinyal, bukan vonis.** `npx knip@5 --reporter compact` (tanpa konfigurasi)
   menandai "tidak diimpor modul lain", bukan "tidak dipakai" — 83% sinyalnya ternyata
   *export berlebih*, bukan kode mati (`/tmp/t1-export-audit.md`).
2. **Grep kata-utuh = vonis.** Tiap kandidat dicek sebagai kata utuh
   (`rg -o '\bSYM\b'`) di seluruh repo (di luar `node_modules/`, `.next/`, `package-lock.json`),
   lalu impor diselesaikan ke berkas pendefinisinya untuk memisahkan "nama kembar" dari "benar-benar diimpor".
3. **Penjaga yang sudah ada** menutup kelas bug ini secara permanen:
   - `src/__tests__/schema-usage.test.ts` — kolom skalar skema wajib dipakai kode (daftar-beku).
   - `src/__tests__/wired-transition-actions.test.ts` — aksi transisi wajib punya pemanggil UI.
   - `src/__tests__/dependency-usage.test.ts` — dependensi runtime wajib dirujuk kode.
   - `src/__tests__/action-permission-guard.test.ts` — server action mutasi wajib dijaga izin.

---

## 1. Sudah dieksekusi (dengan commit)

| Commit | Isi | Bukti |
| --- | --- | --- |
| `d86ec6b4` | **9 dependensi mati** + **4 sisa kode mati** | `package.json`; `tsc 0 error`, vitest 304 berkas / 3771 tes lulus |
| `5d8ba9e0` | parameter `costCenterId` yang selalu `null` dibuang dari 3 hook jurnal | `src/lib/hooks/goods-receipt.hook.ts`, `stock-adjustment.hook.ts`, `src/lib/services/stock-journal.service.ts` |
| `3658c170` | penjaga **dependency-usage** (baru) | `src/__tests__/dependency-usage.test.ts` (+101) |
| `2de3c357` | **25 binding tak terpakai** dibersihkan dari 8 berkas tes | `git show --stat 2de3c357` |
| `98ff5bf8` | **`.gitignore`**: abaikan `/SS/` (33 MB screenshot audit) & `skills-lock.json`; rapikan entri duplikat | `.gitignore` |
| `a72485a6` | **CSS sidebar mati** (`.sidebar-overlay`, `.sidebar-close-btn`) + **helper E2E no-op** `closeMobileSidebarIfOpen` (15 spec, 89 pemanggilan) | `src/app/globals.css`, `e2e/*.spec.ts` |
| `fc1b07be` | penjaga **action-permission-guard** (baru) | `src/__tests__/action-permission-guard.test.ts` (+332) |
| `e8a5a756` | **64 simbol mati** (2 ekspor + 62 tipe) dihapus dari 23 berkas | `git show --stat e8a5a756` |
| `30dbb6a9` | **11 skrip yatim** dibuang + **6 kolom skema** dicatat di daftar-beku | `add-breadcrumbs.mjs`, 10 `scripts/*`; `schema-usage.test.ts` (+12) |
| `55968e37` | **159 selektor CSS mati** (150 blok + 3 pembungkus `@media` kosong) dihapus; `globals.css` 2.922 -> 1.859 baris | `src/app/globals.css`; kurung seimbang 328/328, `tsc` 0 error, vitest 306/3785 lulus |
| `1bcd20ac` | penjaga **kegagalan senyap diperketat** (3 aturan baru: console-only, comment-only, default-return) + **7 kegagalan senyap diperbaiki** | `src/__tests__/silent-failure.test.ts` (+297); login-form, auth.actions, system-settings route, export-buttons, settings-edit-form, notification-dropdown, proyek/[slug], down-payment.hook |
| `9877d1bc` | **12 label mentah** jadi Bahasa Indonesia (akar tunggal: `refTypeMap` menutup 5 lokasi) | `src/lib/utils/format.ts` + 7 halaman |
| `3619af65` | **12 selector E2E rapuh** diperkuat (testid yang tak ada, kelas internal recharts, teks ambigu) | `e2e/*.spec.ts`; `tsc` 0 error |

**9 dependensi mati (`d86ec6b4`).** Dihapus: `@dnd-kit/{core,modifiers,sortable,utilities}` (4),
`@tabler/icons-react`, `@tanstack/react-query`, `vaul`, `zustand` (8 dependensi) + devDependency
`@types/bcryptjs` (bcryptjs 3.x sudah mengirim tipe sendiri). **`sharp` DIPERTAHANKAN** — dipakai
implisit oleh `next/image` (`next.config` `images.formats` avif/webp), bukan impor langsung.
`knip` menandai 10 paket; yang dihapus 9.

**4 sisa kode mati (`d86ec6b4`).** Impor `assertApproved` di `src/actions/purchase.actions.ts`;
impor tipe `ReportPdfKey` di `src/app/api/pdf/route.ts`; pengikatan `user` di
`src/actions/vendor-transfer.actions.ts` (penjaga izin tetap dipanggil); parameter `formatter`
`name` → `_name` di `src/components/dashboard/charts.tsx`.

**64 simbol mati (`e8a5a756`).** 2 ekspor (`FormCard`, `financialTrendSummary`) + 62 tipe dari
`src/lib/constants/status.ts`, `src/lib/validations/*.schemas.ts`, `src/lib/reports/*`,
`src/lib/services/*` (`/tmp/w2-dead-symbols.md`: 64/64 aman dihapus, 0 perlu disimpan).

**11 skrip yatim (`30dbb6a9`).** Dibuang: `add-breadcrumbs.mjs`, `scripts/add-slug-columns.mjs`,
`scripts/gen-slug-migration.mjs`, `scripts/seed-coa.ts`, `scripts/seed-expense-categories.ts`,
`scripts/seed-full-system.ts`, `scripts/seed-dp-flow-e2e.ts`, `scripts/seed-extended-e2e.ts`,
`scripts/seed-final-e2e.ts`, `scripts/seed-gap-e2e.ts`, `scripts/seed-revision-e2e.ts`.
Alasan: codemod sekali-pakai yang hasilnya sudah mendarat, atau seeder rusak/tergantikan jalur
kanonik (`prisma/seed.ts` + `scripts/seed-remaining-e2e.ts`, `.github/workflows/ci.yml:89,164`),
dengan **nol pemanggil** (`/tmp/w2-scripts-final.md`).

**CSS sidebar + helper E2E no-op (`a72485a6`).** `.sidebar-overlay`/`.sidebar-close-btn` hanya ada
di `globals.css` — tak ada komponen `src/` yang merendernya (sidebar mobile memakai shadcn dengan
`[data-slot="backdrop"]`). Helper `closeMobileSidebarIfOpen` di 15 spec menunggu elemen itu; karena
tak pernah ada, ia selalu keluar lebih awal — **penjaga mati, bukan gagal keras**
(`/tmp/t4-e2e-parity.md`), jadi dihapus.

**.gitignore (`98ff5bf8`).** `/SS/` dan `skills-lock.json` (tanpa konsumen kode/CI) kini diabaikan;
`e2e/.auth/`, `test-results/`, `playwright-report/` yang terdaftar dua kali dirapikan.

**25 binding tes (`2de3c357`).** Binding tak terpakai dibersihkan di 8 berkas tes
(`approval.actions.test.ts`, `hrm.actions.test.ts`, `master.actions.test.ts`, `method.actions.test.ts`,
`purchase.actions.test.ts`, `sales-update-return-lock.test.ts`, `sales.actions.test.ts`, `pdf/generator.test.ts`).

**3 penjaga baru/diperluas.**
- `dependency-usage.test.ts` (`3658c170`) — **baru**; setiap dependensi runtime `package.json` harus
  dirujuk kode. Hanya `sharp` yang masuk daftar-beku beralasan (`IMPLICIT_RUNTIME_DEPS`).
- `action-permission-guard.test.ts` (`fc1b07be`) — **baru**; tiap server action yang menyentuh Prisma
  wajib memanggil penjaga izin sebelum mutasi pertama.
- `schema-usage.test.ts` (`30dbb6a9`) — daftar-beku diperluas 6 kolom (lihat §4).
- `wired-transition-actions.test.ts` sudah ada sebelumnya (dari rangkaian transisi, bukan sesi ini).

---

## 2. Belum dieksekusi

| Item | Jumlah | Status | Sumber |
| --- | --- | --- | --- |
| Selektor CSS mati di `src/app/globals.css` | **159 kelas** (150 blok + 3 `@media` kosong, 1.063 baris) | **SELESAI** — `55968e37`. 72 blok sengaja disimpan: `[data-slot="backdrop"]`, elemen `tr`, `.rdp-*` (DayPicker v8), blok `.dark`, dan 9 kelas `status-*` data-driven yang butuh `SELECT DISTINCT` dulu | `/tmp/w2-css-dead.md` |
| Label i18n mentah ke UI | **12 terbukti** (3 gugur) | **SELESAI** — `9877d1bc` | `/tmp/w2-i18n-verified.md` |
| Kegagalan senyap (catch menelan error) | **7 terbukti** (2 gugur) | **SELESAI** — `1bcd20ac`, sekaligus penjaganya diperketat | `/tmp/w2-silent-verified.md` |
| Selector E2E rapuh | **12 berkas** | **SELESAI** — `3619af65` (kaki Playwright divalidasi CI, bukan lokal) | `/tmp/t4-e2e-parity.md` |
| Export berlebih (kelas B `knip`) | **317** (87 ekspor + 230 tipe) | **sengaja tidak disentuh** — dipakai di dalam berkasnya; bukan kode mati | `/tmp/t1-export-audit.md` |
| Kelas C `knip` (re-export sengaja) | **3** | **sengaja tidak disentuh** — permukaan publik yang dikomentari | `/tmp/t1-export-audit.md` |

Temuan audit lanjutan (belum dieksekusi, bukan kode mati — kandidat kualitas):
ukuran bundle (zod 382 kB first-load di 26 rute form; rantai jsPDF 757 kB terunduh
di 87 rute laporan padahal `/api/pdf` merender di server), 30 temuan a11y, 14
anti-pola React 19, dan 51 temuan efisiensi akses Prisma (18 N+1, 12 `findMany`
tanpa `select`, 10 kolom tanpa index). Bahan: `/tmp/w4-*.md`.

---

## 3. Keputusan yang menunggu pemilik repo

**6 kolom skema yang kini tanpa rujukan** — muncul sebagai mati setelah 11 skrip yatim dibuang
(satu-satunya "pemakaian" ada di skrip yang sudah rusak). Terdaftar di daftar-beku
`src/__tests__/schema-usage.test.ts:40-45`. Keputusan per kolom: **implementasikan atau buang lewat migrasi**:

| Model | Kolom | Bukti |
| --- | --- | --- |
| `ApprovalWorkflowStep` | `canSkip` | `prisma/schema.prisma:3291` |
| `Asset` | `assetBrandModelId` | `prisma/schema.prisma:3000` |
| `BankReconciliationItem` | `clearedDate` | `prisma/schema.prisma:2807` |
| `BankStatement` | `totalCredits` | `prisma/schema.prisma:2721` |
| `BankStatement` | `totalDebits` | `prisma/schema.prisma:2720` |
| `BankStatementLine` | `matchedType` | `prisma/schema.prisma:2751` |

**`.commandcode/taste/taste.md`** — **terlacak padahal di-ignore**: `.commandcode/` ada di
`.gitignore:76`, tetapi git tidak menerapkan pola abaikan pada berkas yang sudah terlacak
(`git ls-files --error-unmatch .commandcode/taste/taste.md` → terlacak). Butuh keputusan pemilik
repo: `git rm --cached .commandcode/taste/taste.md` (atau keluarkan `.commandcode/` dari `.gitignore`).

**2 skrip seed yang dipertahankan** (`/tmp/w2-scripts-final.md`): `scripts/seed-hrm-crm-e2e.ts`
(masih jalan via `tsc`, unik: payroll, absensi, cuti, lembur, timesheet, pinjaman, lead+ticket — CI
tidak menyentuh HRM/CRM) dan `scripts/seed-item-transactions.ts` (masih jalan, unik: 1 item demo +
10 `stockMove` kronologis untuk kartu stok). Keduanya **dipertahankan**, bukan dihapus.

---

## Catatan

- Tidak ada `src/`, `e2e/`, atau `globals.css` yang diubah oleh penulisan dokumen ini.
- Dokumen ini tidak mengubah `AUDIT-REPORT.md`, `docs/AUDIT-SCHEMA.md`, `docs/RBAC_AUDIT.md`.
- Angka "belum" bersifat **statis** (tanpa node_modules/.next); verifikasi runtime-nya milik pekerjaan lanjutan.
