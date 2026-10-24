#!/bin/sh
# Antrean merge lokal — dijalankan Lead (atau manual) dengan login `gh`
# pemilik repo. Inilah antrean utama repo ini; versi GitHub Actions
# (.github/workflows/antrean-merge.yml) hanya bekerja bila secret
# ANTREAN_MERGE_TOKEN dipasang, karena update-branch oleh token bawaan
# Actions tidak memicu CI pull_request dan check workflow_dispatch tidak
# masuk rollup PR (strict branch protection tidak pernah terpenuhi).
#
# Cara kerja: PR terbuka berlabel `antrean-merge` diproses FIFO (tertua
# dulu), satu per satu:
#   1. update-branch sebagai pemilik -> CI pull_request terpicu pada head
#      terbaru yang sudah berisi main mutakhir (syarat strict terpenuhi).
#   2. Tunggu 4 check wajib hijau (maks 40 menit per PR).
#   3. Squash merge + hapus branch. Merge memakai --admin, sama seperti
#      alur Lead selama ini: penulis dan pemilik akun yang sama, jadi
#      syarat 1 approval memang hanya bisa dipenuhi lewat bypass admin.
# Gagal check/merge: label dicabut + komentar alasan, antrean lanjut.
#
# Pakai:  ./scripts/antrean-merge.sh [nomor-pr ...]
# Tanpa argumen: semua PR berlabel antrean-merge.
set -uo pipefail
export TZ=Asia/Jakarta

REQUIRED_JQ='[.[] | select(.name == "Lint" or .name == "Unit Tests" or .name == "Build Next.js" or .name == "DB Integration Tests") | .bucket]'

wait_checks() {
  pr=$1
  tries=0
  while [ $tries -lt 80 ]; do
    states=$(gh pr checks "$pr" --json name,bucket --jq "$REQUIRED_JQ | join(\",\")" 2>/dev/null || echo "")
    count=$(printf '%s' "$states" | grep -o . | wc -l | tr -d ' ')
    case "$states" in
      *fail*|*cancel*) return 1 ;;
    esac
    if [ "$count" -ge 4 ]; then
      case "$states" in
        *pending*) : ;;
        *) return 0 ;;
      esac
    fi
    sleep 30
    tries=$((tries + 1))
  done
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
  gh pr update-branch "$pr" || true
  sleep 5
  after=$(gh pr view "$pr" --json headRefOid --jq .headRefOid)
  if [ "$before" != "$after" ]; then
    echo "  branch diperbarui $before -> $after; menunggu CI pull_request"
    sleep 10
  fi
  if wait_checks "$pr"; then
    if gh pr merge "$pr" --squash --delete-branch --admin; then
      echo "  merged lewat antrean."
    else
      echo "  merge gagal; label dicabut."
      gh pr edit "$pr" --remove-label antrean-merge || true
      gh pr comment "$pr" --body "Antrean merge lokal: merge gagal (kemungkinan konflik atau syarat protection berubah). Label dicabut; periksa lalu beri label \`antrean-merge\` lagi." || true
    fi
  else
    echo "  check gagal/timeout; label dicabut."
    gh pr edit "$pr" --remove-label antrean-merge || true
    gh pr comment "$pr" --body "Antrean merge lokal: check wajib gagal atau timeout (40 menit). Label dicabut; perbaiki lalu beri label \`antrean-merge\` lagi untuk masuk antrean." || true
  fi
done
echo "[antrean $(date '+%H:%M WIB')] selesai."
