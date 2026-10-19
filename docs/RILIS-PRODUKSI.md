# Rilis produksi — kredensial & urutan migrasi

Layanan `migrate` + `app` di `docker-compose.prod.yml` membaca
`DATABASE_URL` yang SAMA dari `.env` (single source of truth — bukan
password terpisah per layanan).

## Kredensial

- `DATABASE_URL="mysql://USER:PASSWORD@db:3306/DB_NAME"` — `USER`/`PASSWORD`
  = `DB_USER`/`DB_PASSWORD`, `DB_NAME` = `DB_NAME` di `.env` yang sama.
- Password mengandung `@ / : ? #` WAJIB URL-encode (mis. `p@ss` → `p%40ss`);
  tanpa itu Prisma parse host/user salah dan migrate gagal auth (P1000).
- `DB_PASSWORD` / `DB_ROOT_PASSWORD` memakai sintaks `:?` — kosong = gagal
  keras sebelum apa pun jalan. Jangan commit `.env` produksi (di-ignore).
- Port DB tidak dipublish (P2-4) — hanya service di network compose.

## Urutan rilis

1. Backup DB + uploads; verifikasi restore di environment disposable.
2. `node scripts/pre-migrate-column-audit.mjs` — GAGAL = STOP, jangan lanjut.
3. `docker compose -f docker-compose.prod.yml up migrate` — gagal = rilis gagal.
4. Verifikasi skema + smoke app.
5. `docker compose -f docker-compose.prod.yml up -d app`.

Audit gagal atau migrate gagal = app TIDAK boleh start di atas skema
setengah jalan. Migrasi DROP kolom (20261019000900/1000) hanya aman bila
kolom target kosong di DB itu — audit di atas yang membuktikannya per DB,
bukan klaim "nol rujukan kode".
