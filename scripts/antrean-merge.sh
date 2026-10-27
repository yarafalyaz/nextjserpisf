#!/bin/sh
# Antrean merge lokal — dijalankan Lead (atau manual) dengan login `gh`
# pemilik repo. Inilah antrean utama repo ini; versi GitHub Actions
# (.github/workflows/antrean-merge.yml) hanya bekerja bila secret
# ANTREAN_MERGE_TOKEN dipasang, karena update-branch oleh token bawaan
# Actions tidak memicu CI pull_request dan check workflow_dispatch tidak
# masuk rollup PR (strict branch protection tidak pernah terpenuhi).
#
# PERINGATAN: label `antrean-merge` = izin merge de-facto. Pasang label
# HANYA sesudah verdict manusia/QA tercatat di PR itu.
#
# Cara kerja: PR terbuka berlabel `antrean-merge` diproses FIFO (tertua
# dulu), satu per satu:
#   1. update-branch sebagai pemilik -> CI pull_request terpicu pada head
#      terbaru yang sudah berisi main mutakhir (syarat strict terpenuhi).
#   2. Tunggu gerbang di head yang TERIKAT sesudah update (maks 40 menit):
#      4 check wajib protection masing-masing bucket pass (skipping hanya
#      bila diff merge-base terbukti docs-only), SonarCloud pass, dan
#      Docker Image Build pass bila diff menyentuh jalur Docker persis
#      pola Detect Changes ci.yml.
#   3. Verifikasi ulang headRefOid == SHA yang lolos, lalu squash merge
#      --match-head-commit + hapus branch. Merge memakai --admin, sama
#      seperti alur Lead selama ini: penulis dan pemilik akun yang sama,
#      jadi syarat 1 approval memang hanya bisa dipenuhi lewat bypass
#      admin. --match-head-commit tetap mengunci SHA yang benar-benar
#      dicek walau bypass melewati gerbang approval.
# Gagal check/merge: label dicabut + komentar alasan, antrean lanjut.
#
# Pakai:  ./scripts/antrean-merge.sh [nomor-pr ...]
# Tanpa argumen: semua PR berlabel antrean-merge.
set -uo pipefail
export TZ=Asia/Jakarta

cabut_label() {
  pr=$1; pesan=$2
  gh pr edit "$pr" --remove-label antrean-merge || true
  gh pr comment "$pr" --body "$pesan" || true
}

# Hitungan per nama persis via jq — dilarang menghitung karakter string
# gabungan (bug B1 versi lama: states="pass" = 4 karakter lolos padahal
# baru 1 dari 4 check yang lapor).
wait_checks() {
  pr=$1; target=$2; docs_only=$3; docker_req=$4
  tries=0
  while [ $tries -lt 80 ]; do
    now=$(gh pr view "$pr" --json headRefOid --jq .headRefOid 2>/dev/null || echo "")
    if [ "$now" != "$target" ]; then
      echo "  head bergerak $target -> $now saat menunggu; batalkan putaran ini"
      return 2
    fi
    json=$(gh pr checks "$pr" --json name,bucket 2>/dev/null || echo "[]")
    bad=$(printf '%s' "$json" | jq '[.[] | select(.bucket == "fail" or .bucket == "cancel")] | length')
    if [ "$bad" -gt 0 ]; then
      printf '%s' "$json" | jq -r '.[] | select(.bucket == "fail" or .bucket == "cancel") | "  GAGAL: \(.name) bucket=\(.bucket)"'
      return 1
    fi
    ok=$(printf '%s' "$json" | jq -r \
      --argjson docs "$docs_only" --argjson dreq "$docker_req" '
      def bucket_of($n): ([.[] | select(.name == $n) | .bucket] | first // "absent");
      def wajib_ok($n): (bucket_of($n) == "pass" or ($docs and bucket_of($n) == "skipping"));
      (wajib_ok("Lint") and wajib_ok("Unit Tests")
       and wajib_ok("Build Next.js") and wajib_ok("DB Integration Tests")
       and bucket_of("SonarCloud Code Analysis") == "pass"
       and ((($dreq | not) and (bucket_of("Docker Image Build") == "pass" or bucket_of("Docker Image Build") == "skipping" or bucket_of("Docker Image Build") == "absent"))
            or ($dreq and bucket_of("Docker Image Build") == "pass")))')
    if [ "$ok" = "true" ]; then
      return 0
    fi
    sleep 30
    tries=$((tries + 1))
  done
  echo "  timeout menunggu check di head $target"
  return 1
}

if [ $# -gt 0 ]; then
  prs="$*"
else
  prs=$(gh pr list --label antrean-merge --state open --json number,createdAt,isDraft --jq '[.[] | select(.isDraft | not)] | sort_by(.createdAt) | .[].number')
fi

if [ -z "${prs}" ]; then
  echo "[antrean $(date '+%H:%M WIB')] kosong."
  exit 0
fi

for pr in $prs; do
  echo "[antrean $(date '+%H:%M WIB')] PR #$pr"
  state=$(gh pr view "$pr" --json state --jq .state)
  if [ "$state" != "OPEN" ]; then
    echo "  dilewati: bukan OPEN"
    continue
  fi
  before=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)

  # Klasifikasi diff dari merge-base PR: skipping docs-only yang sah dan
  # kewajiban Docker. Pola Docker sama persis output `docker` ci.yml.
  git fetch origin "pull/$pr/head:refs/antrean/pr-$pr" "main:refs/antrean/main" --quiet
  files=$(git diff --name-only "refs/antrean/main...refs/antrean/pr-$pr")
  if [ -n "$files" ] && ! printf '%s\n' "$files" | grep -qvE '\.md$'; then docs_only=true; else docs_only=false; fi
  if printf '%s\n' "$files" | grep -qE '^(Dockerfile|docker/|\.dockerignore|docker-compose|package(-lock)?\.json|prisma/|next\.config\.)'; then docker_req=true; else docker_req=false; fi
  echo "  docs_only=$docs_only docker_wajib=$docker_req"

  if ! gh pr update-branch "$pr"; then
    echo "  update-branch gagal; label dicabut."
    cabut_label "$pr" "Antrean merge lokal: update-branch gagal, head tidak terikat ke main terbaru. Label dicabut; periksa konflik lalu beri label \`antrean-merge\` lagi."
    continue
  fi
  sleep 5
  after=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
  if [ "$before" != "$after" ]; then
    echo "  branch diperbarui $before -> $after; menunggu CI pull_request"
    sleep 10
  fi

  if wait_checks "$pr" "$after" "$docs_only" "$docker_req"; then
    final=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
    if [ "$final" != "$after" ]; then
      echo "  head bergerak $after -> $final sesudah check lolos; tidak di-merge putaran ini."
      cabut_label "$pr" "Antrean merge lokal: head bergerak sesudah check lolos ($after -> $final). Label dicabut demi keamanan; beri label \`antrean-merge\` lagi untuk putaran baru."
      continue
    fi
    if gh pr merge "$pr" --squash --delete-branch --admin --match-head-commit "$after"; then
      echo "  merged lewat antrean di head $after."
    else
      echo "  merge gagal; label dicabut."
      cabut_label "$pr" "Antrean merge lokal: merge gagal di head $after (kemungkinan konflik atau syarat protection berubah). Label dicabut; periksa lalu beri label \`antrean-merge\` lagi."
    fi
  else
    rc=$?
    if [ "$rc" -eq 2 ]; then
      cabut_label "$pr" "Antrean merge lokal: head PR bergerak saat check ditunggu. Label dicabut; beri label \`antrean-merge\` lagi untuk putaran baru di head terbaru."
    else
      echo "  check gagal/timeout; label dicabut."
      cabut_label "$pr" "Antrean merge lokal: check gagal atau timeout (40 menit) di head yang terikat sesudah update-branch. Label dicabut; perbaiki lalu beri label \`antrean-merge\` lagi untuk masuk antrean."
    fi
  fi
done
echo "[antrean $(date '+%H:%M WIB')] selesai."
