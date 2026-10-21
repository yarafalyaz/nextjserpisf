#!/bin/zsh
set -euo pipefail

# Safe bootstrap for Hermes profiles + Git worktrees.
# Run from the root of yarafalyaz/nextjserpisf.
# This script never modifies the default Hermes config or existing profiles.

typeset -a NAMES DESCRIPTIONS PROMPTS TOOLSETS
NAMES=(isf-lead isf-frontend isf-backend isf-finance-tax isf-business isf-qa)
DESCRIPTIONS=(
  "ISF ERP lead architect; coordinates feature research, Kanban tasks, and Git/PR integration."
  "ISF ERP frontend specialist; Next.js, TypeScript, shadcn/ui, and UX."
  "ISF ERP backend specialist; Prisma, MySQL, inventory, purchasing, workshop, and costing."
  "ISF ERP accounting, finance, and Indonesian tax research specialist."
  "ISF ERP sales, CRM, HR/payroll, and business workflow specialist."
  "ISF ERP independent QA, security, reconciliation, and release auditor."
)
PROMPTS=(lead.md frontend.md backend.md finance-tax.md business.md qa.md)

die() { print -u2 -- "ERROR: $*"; exit 1; }
info() { print -- "==> $*"; }

command -v hermes >/dev/null 2>&1 || die "hermes CLI tidak ditemukan di PATH."
command -v git >/dev/null 2>&1 || die "git tidak ditemukan."
command -v ruby >/dev/null 2>&1 || die "Ruby tidak ditemukan; dibutuhkan untuk mengubah YAML profil baru dengan aman."

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "Jalankan script dari dalam clone Git repository."
cd "$REPO_ROOT"

REMOTE="$(git remote get-url origin 2>/dev/null || true)"
[[ "$REMOTE" == *"yarafalyaz/nextjserpisf"* ]] || die "Remote origin bukan yarafalyaz/nextjserpisf: $REMOTE"
[[ -f package.json && -d prisma ]] || die "Tidak menemukan package.json dan prisma/; repository tampaknya tidak sesuai."

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree tidak bersih. Commit/stash perubahan yang ingin dipertahankan, lalu jalankan ulang. Script tidak akan membuang perubahan lokal."
fi

# Prefer origin/main as the clean base so agent worktrees do not branch from this setup PR.
# If the remote-tracking ref is unavailable, use the current clean HEAD and print the choice.
if git show-ref --verify --quiet refs/remotes/origin/main; then
  BASE_SHA="$(git rev-parse origin/main)"
else
  BASE_SHA="$(git rev-parse HEAD)"
fi

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
[[ -f "$HERMES_HOME/config.yaml" ]] || die "Config default Hermes tidak ditemukan: $HERMES_HOME/config.yaml"

# Preflight compatibility before any mutation.
CREATE_HELP="$(hermes profile create --help 2>&1 || true)"
[[ "$CREATE_HELP" == *"--clone"* ]] || die "CLI ini tidak menampilkan opsi profile create --clone. Tidak ada perubahan dilakukan; periksa hermes profile create --help."
KANBAN_HELP="$(hermes kanban boards --help 2>&1 || true)"
[[ "$KANBAN_HELP" == *"create"* ]] || die "CLI ini tidak menampilkan dukungan Kanban boards create. Tidak ada perubahan dilakukan; periksa versi Hermes."

# Require local terminal backend. A non-local backend needs a separately designed workspace mapping.
BACKEND="$(ruby -ryaml -e 'c=YAML.load_file(ARGV[0]) || {}; puts(c.dig("terminal","backend") || "local")' "$HERMES_HOME/config.yaml")"
[[ "$BACKEND" == "local" ]] || die "terminal.backend default adalah '$BACKEND'. Script ini menyiapkan local Git worktrees; sesuaikan konfigurasi sandbox terlebih dahulu."

# Refuse collisions rather than overwrite profiles, worktrees, or branches.
WORKSPACE_ROOT="$HERMES_HOME/workspaces/isf-erp"
for i in {1..6}; do
  name="${NAMES[$i]}"
  profile_dir="$HERMES_HOME/profiles/$name"
  worktree="$WORKSPACE_ROOT/$name"
  branch="agents/$name"
  [[ ! -e "$profile_dir" ]] || die "Profile sudah ada: $profile_dir. Tidak akan menimpa profile yang ada."
  [[ ! -e "$worktree" ]] || die "Worktree sudah ada: $worktree. Tidak akan menimpa worktree yang ada."
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    die "Branch sudah ada: $branch. Tidak akan menggunakan ulang branch yang mungkin berisi pekerjaan."
  fi
done

info "Versi Hermes:"
hermes --version
info "Repository: $REPO_ROOT"
info "Remote origin: $REMOTE"
info "Base commit untuk worktrees: $BASE_SHA"
info "Working tree bersih; default Hermes config dan cron tidak akan diubah."

mkdir -p "$WORKSPACE_ROOT"
created_profiles=()
created_worktrees=()

cleanup_on_error() {
  status=$?
  if [[ $status -ne 0 ]]; then
    print -u2 -- "Bootstrap berhenti dengan error. Script tidak menghapus profil/worktree yang telah dibuat agar pekerjaan dapat diperiksa dan dipulihkan manual."
    print -u2 -- "Profil dibuat: ${(j:, :)created_profiles}"
    print -u2 -- "Worktree dibuat: ${(j:, :)created_worktrees}"
  fi
  exit $status
}
trap cleanup_on_error EXIT

# Create independent branches/worktrees first.
for i in {1..6}; do
  name="${NAMES[$i]}"
  worktree="$WORKSPACE_ROOT/$name"
  branch="agents/$name"
  info "Membuat worktree $name ($branch)"
  git worktree add -b "$branch" "$worktree" "$BASE_SHA"
  created_worktrees+=("$worktree")
done

# Clone runtime config for the routed model, but do NOT clone messaging channels or cron jobs.
# Then overwrite only the newly created profile's SOUL.md and role toolset list.
for i in {1..6}; do
  name="${NAMES[$i]}"
  desc="${DESCRIPTIONS[$i]}"
  prompt_file="$REPO_ROOT/ops/hermes-isf/roles/${PROMPTS[$i]}"
  profile_dir="$HERMES_HOME/profiles/$name"
  worktree="$WORKSPACE_ROOT/$name"

  [[ -f "$prompt_file" ]] || die "Prompt tidak ditemukan: $prompt_file"

  info "Membuat Hermes profile $name"
  if [[ "$CREATE_HELP" == *"--description"* ]]; then
    hermes profile create "$name" --clone --description "$desc"
  else
    hermes profile create "$name" --clone
  fi
  created_profiles+=("$name")

  [[ -d "$profile_dir" ]] || die "Profile create tidak menghasilkan direktori yang diharapkan: $profile_dir"
  cp "$prompt_file" "$profile_dir/SOUL.md"

  # Configure the new profile only. Do not touch ~/.hermes/config.yaml.
  ruby -ryaml -e '
    path, cwd, role = ARGV
    config = YAML.load_file(path) || {}
    config["terminal"] ||= {}
    config["terminal"]["cwd"] = cwd
    # Use role-oriented toolsets. Only the lead may delegate or use code_execution.
    common = %w[web search file terminal skills todo memory session_search kanban]
    config["toolsets"] = if role == "lead"
      common + %w[delegation code_execution]
    else
      common
    end
    File.write(path, YAML.dump(config))
  ' "$profile_dir/config.yaml" "$worktree" "$name"
done

# Create/reuse a dedicated board without disturbing the existing default board.
BOARDS="$(hermes kanban boards list 2>&1 || true)"
if [[ "$BOARDS" == *"isf-erp"* ]]; then
  info "Board isf-erp sudah ada; tidak diubah."
else
  info "Membuat board Kanban isf-erp"
  hermes kanban boards create isf-erp --name "ISF ERP" --description "Research and engineering tasks for ISF ERP; Next.js, TypeScript, shadcn/ui, Prisma, MySQL." --switch
fi

trap - EXIT
info "Bootstrap selesai. Tidak ada task yang dibuat dan tidak ada agent yang dijalankan otomatis."
print -- ""
print -- "Langkah verifikasi:"
print -- "  hermes profile list"
print -- "  hermes kanban boards list"
print -- "  hermes kanban assignees"
print -- "  hermes kanban diagnostics"
print -- ""
print -- "Worktrees:"
for i in {1..6}; do
  print -- "  ${NAMES[$i]} -> $WORKSPACE_ROOT/${NAMES[$i]}"
done
print -- ""
print -- "Catatan: terminal.cwd bukan sandbox OS. Toolsets adalah pembatas kasar; local terminal masih dapat mengakses path lain."
