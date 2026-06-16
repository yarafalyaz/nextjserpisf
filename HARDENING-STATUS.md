# Silengkap Hardening — Status

> Snapshot terakhir: 2026-06-16 ~19:00 WIB. Working tree bersih, main @ `1ebc9bc`.

## Ringkasan Eksekutif

| Status | Nilai |
|---|---|
| CI GitHub (10 run terakhir) | **10/10 GAGAL** |
| Unit test lokal | 2573 pass, 0 fail |
| TypeScript | 0 error |
| Cron marathon | 3 job di-PAUSE (bahaya) |
| HEAD | `1ebc9bc` (belum diuji CI) |
| Konflik terbuka | AlertDialog accessible name "Hapus data ini?" tidak match selector E2E |

---

## ✅ SUDAH DIKERJAKAN (Sesi ini + sebelumnya)

### Bug nyata yang di-fix dan sudah di CI pass
| Commit | File | Bug |
|---|---|---|
| `5ea005f` | `e2e/*.spec.ts` (11 file) | E2E selector `aria-label='Menu'` putus karena a11y hardening ganti ke `"Buka menu aksi"`. Fix: 11 specs di-sync. |
| `79856f2` | `e2e/*.spec.ts` (10 file) | E2E selector `getByRole("button", { name: "Menu" })` putus. Fix: 17 occurrences di 10 files. Sekaligus `.gitignore` untuk cron note internal. |

### Bug nyata yang di-fix dari compacted context (sebelumnya)
| Commit | Bug |
|---|---|
| `f0bde6e` | Inventory FIFO: serial-tracking qty mismatch (data integrity). |
| `0002d10` | Sales proof upload: tanpa size cap + ekstensi whitelist (DoS + Stored XSS di `public/`). |
| `3d6bc6d` | Attachment serving: tambah `nosniff` + CSP sandbox + force-download untuk non-preview. |

### Guardrails ditambahkan
- **3 prompt cron marathon di-update** dengan PRE-COMMIT GUARD: wajib `grep "aria-label=\|getByRole\|getByText\|locator(" e2e/` sebelum commit perubahan UI, dan update selector di commit yang sama.
- **`.gitignore`**: exclude `.hermes/audited-*.txt` (catatan internal cron, bocor ke repo sebelumnya).
- **Memory entry**: pelajaran marathon agent limitation (tsc+vitest ≠ E2E) disimpan untuk referensi future session.

### Audit / sweep yang sudah dilakukan (tidak ada bug)
- API routes (24 total) — semua yang butuh auth sudah punya guard (`isValidCronRequest` constant-time, `hasPermission`, `requireAuth`).
- `isValidCronRequest` — constant-time compare, fail-closed, tidak bocor secret via timing.
- `upload/items` — `hasPermission("create_items")`.
- `backup/download` — `hasPermission("manage_settings")` + path-traversal sanitization (strip + reject mismatch).
- `reverseJournal` (finance) — optimistic lock + claim-rollback pattern benar.

---

## ❌ BELUM / MASIH GAGAL

### Critical: AlertDialog accessible name mismatch
**Status:** 8 E2E specs gagal, 10 CI run terakhir merah semua.

Spec cari:
```ts
getByRole('alertdialog', { name: 'Hapus data ini?' })
```

Component render:
- `src/components/ui/delete-button.tsx:63` → `<ConfirmDialog title="Hapus data ini?">`
- `src/components/ui/action-dropdown.tsx:107` → `<ConfirmDialog title="Hapus data ini?">`
- `ConfirmDialog` pakai shadcn `<AlertDialogTitle>` — **belum diverifikasi apakah accessible name ter-resolve**.

Spesifikasi file yang terdampak (8):
- `e2e/module-coverage.spec.ts`
- `e2e/master-kelompok-pauk-crud.spec.ts`
- `e2e/crm-leads-crud.spec.ts`
- `e2e/inventory-rack-row-crud.spec.ts`
- `e2e/master-crud-batch.spec.ts`
- `e2e/keuangan-pusat-biaya-crud.spec.ts`
- `e2e/master-gudang-crud.spec.ts`
- `e2e/master-syarat-pembayaran-crud.spec.ts`

**Action yang dibutuhkan:** verifikasi component `shadcn/alert-dialog.tsx` apakah `<AlertDialogContent>` punya `aria-labelledby` yang merujuk ke `AlertDialogTitle` id. Kalau tidak, fix di shadcn component. Kalau iya, fix di test (pakai `getByText` atau selector lain).

### Cron job di-PAUSE
Tiga job di-pause karena agents mendorong 22+ commit dalam 24 jam terakhir yang **mayoritas belum di-verify CI hijau**:

```
autonomous-bughunter-marathon   4f72b744eb59  paused
autonomous-frontend-marathon    c5231a4a221a  paused
autonomous-backend-marathon     ba21114453a9  paused
```

**TIDAK di-resume sampai AlertDialog fix landed dan CI hijau.**

### Speculative fix yang di-REVERT
- `638a846` `fix(finance): never let rollback failure mask original reverseJournal error`
- `784a4a5` `Revert "fix(finance): ..."`
- **Pelajaran:** jangan ubah kode produksi yang sudah benar tanpa bukti konkret (failing test / log / repro). ReverseJournal pattern aslinya solid — rollback jarang gagal dan kalau gagal, log sederhana cukup. Tidak perlu try/catch nested.

### Area yang belum di-sweep
- **Race condition di approval workflow multi-step** (transisi status antar step)
- **JSON parsing user input** yang dirender sebagai HTML (XSS via form JSON blob)
- **Soft-delete vs hard-delete inconsistency** (mana yang dipakai per resource)
- **IDOR per-resource** — pola `getById` yang tidak cek ownership
- **Form double-submit** — guard `useFormStatus` di client form

### Upgrade tertunda
- `next` 16.2.7 → 16.2.9 (patch, paralel) — belum dijalankan

---

## 🔧 Konfigurasi Aktif

### Cron jobs (semua PAUSED)
| Job ID | Schedule | Toolsets | Tujuan |
|---|---|---|---|
| `4f72b744eb59` | every 15m | terminal, file, coding | bug hunter full-stack |
| `c5231a4a221a` | every 20m | terminal, file, coding | frontend refactor |
| `ba21114453a9` | every 17m | terminal, file, coding | backend N+1 + Zod |
| `ci-watchdog` | every 30m | — | monitor CI, kirim Telegram |
| `ci-cleanup` | every 6h | — | cleanup CI artifacts |

Workdir: `/Users/yarafalyaz/Project/silengkap`. Delivery: Telegram. Override env: `GIT_COMMITTER_NAME=yarafalyaz`, `GIT_COMMITTER_EMAIL=yoda.cris@gmail.com` (SSH signing).

### Helper scripts
- `scripts/find-target-coverage.py` — masih ada, tapi sudah tidak dipakai cron (sudah dialihkan ke bug-hunt).

---

## 📋 Next Steps (urutan prioritas)

1. **[CRITICAL] Fix AlertDialog accessible name** — verifikasi `shadcn/alert-dialog.tsx`, fix component atau 8 specs, lalu commit & push.
2. **[WAIT] Tunggu CI 100% hijau** (commit terakhir `1ebc9bc` masih in progress).
3. **[EVALUATE] Evaluasi cron jobs sebelum resume** — apakah pre-commit guard E2E sudah cukup? Apakah agents juga harus self-check `gh run list` sebelum push berikutnya?
4. **[RESUME] Resume cron marathon** satu per satu dengan batasan: max 1 commit per run, dan **WAJIB skip push kalau CI run sebelumnya belum success** (cek `gh run list` di awal).
5. **[SWEEP Lanjutan] Lanjut hunt**: approval workflow race, IDOR per-resource, double-submit guard.

---

## 📝 Pelajaran Kunci (untuk next session)

1. **Marathon agents ≠ green CI.** Tsc + vitest pass ≠ Playwright pass. Setiap perubahan UI (aria-label, role, button text) wajib grep `e2e/` dan sinkronkan selector. Sudah masuk prompt 3 job, tapi tetap perlu discipline.
2. **JANGAN autonomous-hardening kode produksi yang sudah benar.** Bukti konkret (failing test) wajib. Kalau ragu, laporkan sebagai observasi saja, jangan commit.
3. **CI queue GitHub tidak konflik** antar run — multiple push bisa paralel. Tapi kalau satu run gagal, **push berikutnya bisa menutupi error** dan mempersulit debug. Selalu baca status run terakhir sebelum push baru.
4. **Hemat memory.** Slot memori 2,200 chars. Consolidate / replace saat hampir penuh, jangan sampai gagal add.
