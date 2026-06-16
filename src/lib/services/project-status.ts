/**
 * Pure project-status sync math, extracted from
 * `src/actions/manufacturing.actions.ts` so the transition rules can be
 * unit-tested without Prisma.
 *
 * A project is "completed" iff every one of its stages is completed OR
 * skipped. A project is "in_progress" iff at least one stage is in_progress
 * OR at least one is completed (i.e. the project has been started but not
 * all stages are done). Otherwise the function returns the current project
 * unchanged (e.g. a brand-new project with no stages touched yet).
 *
 * endDate is only written on a real transition:
 *  - completing all stages for the first time -> set endDate to `now`
 *  - moving away from completed (e.g. a stage re-opens) -> clear endDate
 *  - re-running while the project is ALREADY completed -> leave endDate
 *    untouched. The previous code unconditionally wrote `endDate: new Date()`
 *    every call, which drifted the historical completion date forward every
 *    time a new work order for the same project completed later (e.g.
 *    warranty follow-up work, additional scope). That corrupted the
 *    completion timestamp used for SLA reporting, customer follow-ups, and
 *    analytics — the bug that prompted the extraction.
 */

export type ProjectStageStatus = "pending" | "in_progress" | "completed" | "skipped" | string

export interface ProjectStageLike {
  status: ProjectStageStatus
}

export interface ProjectStatusResult {
  status: "completed" | "in_progress" | "active"
  endDate: Date | null
  changed: boolean
}

export function computeProjectStatus(
  stages: ProjectStageLike[],
  currentStatus: string,
  currentEndDate: Date | null,
  now: Date
): ProjectStatusResult {
  const total = stages.length
  if (total === 0) {
    return { status: "active", endDate: currentEndDate, changed: false }
  }

  const completedCount = stages.filter(
    (s) => s.status === "completed" || s.status === "skipped"
  ).length
  const inProgressCount = stages.filter((s) => s.status === "in_progress").length

  if (completedCount === total) {
    // Already completed: preserve the existing endDate. Only stamp it on the
    // forward transition from non-completed -> completed.
    if (currentStatus === "completed" && currentEndDate instanceof Date) {
      return { status: "completed", endDate: currentEndDate, changed: false }
    }
    return { status: "completed", endDate: now, changed: true }
  }

  if (inProgressCount > 0 || completedCount > 0) {
    // In-progress: only clear endDate on the transition FROM completed.
    const nextEndDate = currentStatus === "completed" ? null : currentEndDate
    const changed =
      currentStatus !== "in_progress" || currentEndDate !== nextEndDate
    return { status: "in_progress", endDate: nextEndDate, changed }
  }

  // No active or completed stages -> no status change.
  return {
    status: currentStatus === "completed" ? "completed" : "active",
    endDate: currentStatus === "completed" ? currentEndDate : null,
    changed: false,
  }
}
