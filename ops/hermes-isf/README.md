# Hermes ISF — Six-Agent Bootstrap

This bundle prepares six named Hermes profiles for the ISF ERP repository.

## Target stack
Next.js full-stack, TypeScript, shadcn/ui, Prisma ORM, MySQL. The repo is the source of truth; agents must inspect the current checkout before making assumptions.

## Agent roles
- `isf-lead`: architecture, research coordination, Kanban triage, Git/PR integration.
- `isf-frontend`: Next.js, TypeScript, shadcn/ui and UX.
- `isf-backend`: Prisma/MySQL, inventory, purchasing, workshop and project costing.
- `isf-finance-tax`: accounting, finance and Indonesian tax research.
- `isf-business`: sales, CRM, HR/payroll and workflows.
- `isf-qa`: independent QA, security, reconciliation and release audit.

## What the setup script does
1. Checks the installed Hermes CLI and repository state.
2. Refuses to run if the checkout is dirty, belongs to a different remote, or a target profile/worktree already exists.
3. Creates a dedicated Git branch and worktree for each role.
4. Creates each Hermes profile by cloning the current default profile's runtime configuration, without requesting channel cloning; then installs the role prompt and role-specific toolset list.
5. Sets each profile's terminal working directory to its own worktree.
6. Creates or reuses the `isf-erp` Kanban board.

It does **not** edit the default `~/.hermes/config.yaml`, alter existing cron jobs, delete profiles, create Telegram bots, or start/stop/restart the gateway. It does not create tasks or launch agents automatically.

## Run on the Mac
From the root of the local clone of `yarafalyaz/nextjserpisf`:

```zsh
zsh ops/hermes-isf/setup.zsh
```

The script uses the local `origin/main` commit as the base for isolated agent branches when that remote-tracking ref exists; otherwise it falls back to the current clean HEAD. Run `git fetch origin main` before setup if you want the newest remote main. Commit or stash any desired changes first; it deliberately refuses to proceed with a dirty worktree so work is not silently omitted.

## First-time provider setup
The script clones the default profile's runtime config and provider environment to avoid re-entering the same routed model setup six times. It does not ask to clone messaging channels or cron jobs. Review the resulting profile list and confirm there are no duplicate Telegram/channel credentials before starting any profile gateway.

## Tool permissions and isolation
Hermes toolsets are coarse-grained. The profiles get role-oriented toolsets; only the lead gets the `delegation` and `code_execution` toolsets. This is **not** an operating-system sandbox: a local terminal process can still access paths outside its configured working directory. The prompts and dedicated worktrees reduce collisions but do not create a hard security boundary. For untrusted code or strict read-only guarantees, use a separately configured Docker/remote terminal sandbox and restrict mounted paths.

## GitHub access
Each worktree shares the repository's Git remote. Git push/PR operations require a valid existing Git credential (SSH key or credential helper). Verify locally with:

```zsh
git remote -v
gh auth status
```

Do not put tokens in the repository, prompt files, task bodies, or logs. For Kanban PR acceptance checks that use `gh`, the installed Hermes version may require profile-scoped GitHub authentication; configure that separately only if using that feature.

## Verification
After setup:

```zsh
hermes --version
hermes profile list
hermes kanban boards list
hermes kanban assignees
hermes kanban diagnostics
```

Check each profile with `hermes -p isf-lead config` (replace the name as needed) and inspect the profile's `config.yaml` without printing any `.env` secrets.

The setup is complete when all six profiles are listed, each has a dedicated worktree/branch and role prompt, and the `isf-erp` board is available. Workers will not start until tasks are assigned and the Kanban dispatcher is active.
