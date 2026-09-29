"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Play, Check, SkipForward, RotateCcw, AlertCircle, Calendar, MessageSquare, Edit3, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StatusChip } from "@/components/ui/status-chip"
import { Progress } from "@/components/ui/shadcn/progress"
import { showSuccess, showError } from "@/lib/utils/toast"
import { formatDate } from "@/lib/utils/format"
import { cn } from "@/lib/utils"
import { updateProjectStageProgress } from "@/actions/project.actions"

interface StageProgress {
  id: number
  percentage: number
  notes: string | null
  createdAt: Date
}

interface Stage {
  id: number
  projectId: number
  name: string
  sortOrder: number
  status: string
  startedAt: Date | string | null
  completedAt: Date | string | null
  notes: string | null
  progress: StageProgress[]
}

interface ProjectStagesProps {
  projectId: number
  stages: Stage[]
  canEdit: boolean
}

const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu Antrean",
  in_progress: "Sedang Dikerjakan",
  completed: "Selesai",
  skipped: "Dilewati",
}

export function ProjectStages({ projectId, stages, canEdit }: ProjectStagesProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // State for confirm dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null)
  const [targetStatus, setTargetStatus] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [percentage, setPercentage] = useState<number>(0)
  const [isUpdatingProgressOnly, setIsUpdatingProgressOnly] = useState(false)

  // Determine stage eligibility (all prior stages must be completed or skipped)
  const isStageEligible = (stageIndex: number) => {
    for (let i = 0; i < stageIndex; i++) {
      const status = stages[i].status
      if (status !== "completed" && status !== "skipped") {
        return false
      }
    }
    return true
  }

  // Calculate overall physical progress percentage
  const overallProgress = stages.length > 0 
    ? Math.round(
        stages.reduce((sum, s) => {
          const recordPercent = s.progress?.[0]?.percentage
          if (recordPercent !== undefined) return sum + recordPercent
          
          if (s.status === "completed" || s.status === "skipped") return sum + 100
          if (s.status === "in_progress") return sum + 50
          return sum
        }, 0) / stages.length
      )
    : 0

  const handleActionClick = (stage: Stage, status: string, isProgressOnly = false) => {
    setSelectedStage(stage)
    setTargetStatus(status)
    setNotes("")
    setIsUpdatingProgressOnly(isProgressOnly)
    
    // Set initial percentage
    const latestPercentage = stage.progress?.[0]?.percentage
    if (isProgressOnly && latestPercentage !== undefined) {
      setPercentage(latestPercentage)
    } else if (status === "in_progress") {
      setPercentage(latestPercentage ?? 10) // default initial progress to 10%
    } else if (status === "completed" || status === "skipped") {
      setPercentage(100)
    } else {
      setPercentage(0)
    }
    
    setDialogOpen(true)
  }

  const handleConfirm = () => {
    if (!selectedStage) return

    startTransition(async () => {
      try {
        const res = await updateProjectStageProgress(
          projectId,
          selectedStage.id,
          targetStatus,
          notes || undefined,
          targetStatus === "in_progress" ? percentage : undefined
        )

        if (res.success) {
          showSuccess(
            isUpdatingProgressOnly
              ? "Progres tahapan berhasil diperbarui"
              : "Status tahapan berhasil diperbarui"
          )
          setDialogOpen(false)
          router.refresh()
        } else {
          showError(res.error || "Terjadi kesalahan")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Terjadi kesalahan")
      }
    })
  }

  // Helper to format duration string
  const getDurationString = (start: Date | string, end: Date | string) => {
    const s = new Date(start)
    const e = new Date(end)
    const diffTime = Math.abs(e.getTime() - s.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    if (diffDays <= 1) {
      const diffHours = Math.round(diffTime / (1000 * 60 * 60))
      return `${diffHours || 1} jam`
    }
    return `${diffDays} hari`
  }

  return (
    <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden flex flex-col gap-6">
      {/* Header & Overall Progress */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-5 border-b border-default bg-surface-secondary/30 gap-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Timeline & Tahapan Pengerjaan Fisik</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Pantau dan kelola tahapan pengerjaan karoseri kendaraan pelanggan</p>
        </div>
        <div className="flex items-center gap-4 min-w-[240px]">
          <div className="text-right shrink-0">
            <span className="text-xs text-muted-foreground font-semibold block">Total Progres</span>
            <span className="text-2xl font-black text-primary">{overallProgress}%</span>
          </div>
          <div className="w-full">
            <Progress value={overallProgress} className="h-2 bg-default/40" />
          </div>
        </div>
      </div>

      {/* Timeline List */}
      <div className="p-5 px-6 pt-2">
        {stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
            <AlertCircle className="size-8 text-muted-foreground/60 animate-bounce" />
            <p className="text-sm">Belum ada tahapan diinisialisasi untuk proyek ini.</p>
          </div>
        ) : (
          <div className="relative border-l-2 border-primary/20 ml-4 pl-6 my-2 flex flex-col gap-8">
            {stages.map((stage, index) => {
              const isActive = stage.status === "in_progress"
              const isCompleted = stage.status === "completed"
              const isSkipped = stage.status === "skipped"
              const isDone = isCompleted || isSkipped
              const eligible = isStageEligible(index)

              // Determine current percentage
              const currentPercent = stage.progress?.[0]?.percentage ?? (isDone ? 100 : isActive ? 50 : 0)

              return (
                <div key={stage.id} className="relative group">
                  {/* Timeline Dot Indicator */}
                  <span
                    className={cn(
                      "absolute -left-[35px] top-1.5 size-6 rounded-full border-2 transition-all flex items-center justify-center shadow-sm z-10",
                      isCompleted ? "bg-success border-success text-white" :
                      isSkipped ? "bg-warning border-warning text-white" :
                      isActive ? "bg-primary border-primary animate-pulse text-white" :
                      "bg-surface border-default-hover text-muted-foreground"
                    )}
                  >
                    {isCompleted && <Check className="size-3.5 stroke-[3]" />}
                    {isSkipped && <SkipForward className="size-3.5" />}
                    {isActive && <Play className="size-3 fill-current ml-0.5" />}
                    {!isDone && !isActive && <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
                  </span>

                  <div className="bg-surface-secondary/40 hover:bg-surface-secondary/80 border border-default/50 rounded-xl p-4 transition-all duration-200">
                    <div className="flex justify-between items-start flex-wrap gap-3">
                      <div>
                        <h3 className={cn("text-sm font-bold", isActive ? "text-primary text-base" : "text-foreground")}>
                          {stage.name}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {STAGE_STATUS_LABELS[stage.status] ?? stage.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <StatusChip status={stage.status} />
                        <span className="text-xs font-bold text-foreground px-2 py-0.5 rounded-md bg-default border border-default">{currentPercent}%</span>
                      </div>
                    </div>

                    {/* Progress Bar for the Individual Stage */}
                    <div className="w-full bg-default/40 rounded-full h-1.5 mt-3">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          isCompleted ? "bg-success" :
                          isSkipped ? "bg-warning" : "bg-primary"
                        )}
                        style={{ width: `${currentPercent}%` }}
                      />
                    </div>

                    {/* Date Details & Duration */}
                    {(stage.startedAt || stage.completedAt) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3.5 text-[11px] text-muted-foreground border-t border-default/30 pt-2.5">
                        {stage.startedAt && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="size-3 text-primary/70" />
                            Mulai: <strong className="text-foreground">{formatDate(new Date(stage.startedAt))}</strong>
                          </span>
                        )}
                        {stage.completedAt && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="size-3 text-success/70" />
                            Selesai: <strong className="text-foreground">{formatDate(new Date(stage.completedAt))}</strong>
                          </span>
                        )}
                        {stage.startedAt && stage.completedAt && (
                          <span className="flex items-center gap-1.5 ml-auto text-success font-semibold">
                            <Clock className="size-3" />
                            Durasi: {getDurationString(stage.startedAt, stage.completedAt)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Notes Box */}
                    {stage.notes && (
                      <div className="mt-3 text-xs bg-surface border border-default p-2.5 rounded-lg text-muted-foreground flex gap-2 items-start shadow-sm">
                        <MessageSquare className="size-3.5 shrink-0 text-primary/60 mt-0.5" />
                        <span className="italic">&quot;{stage.notes}&quot;</span>
                      </div>
                    )}

                    {/* Interactive Action Buttons */}
                    {canEdit && (
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 pt-3 border-t border-default/30">
                        {/* If pending: can start or skip */}
                        {stage.status === "pending" && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              isDisabled={isPending || !eligible}
                              onClick={() => handleActionClick(stage, "in_progress")}
                              className="w-full sm:w-auto shadow-sm"
                            >
                              <Play className="size-3 fill-current mr-1.5" /> Mulai Tahap
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              isDisabled={isPending || !eligible}
                              onClick={() => handleActionClick(stage, "skipped")}
                              className="w-full sm:w-auto"
                            >
                              <SkipForward className="size-3 mr-1.5" /> Lewati
                            </Button>
                          </>
                        )}

                        {/* If in_progress: can complete, update progress, or return to pending */}
                        {stage.status === "in_progress" && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              isDisabled={isPending || !eligible}
                              onClick={() => handleActionClick(stage, "completed")}
                              className="w-full sm:w-auto bg-success hover:bg-success/90 border-success text-white shadow-sm"
                            >
                              <Check className="size-3 mr-1.5 stroke-[3]" /> Selesaikan
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              isDisabled={isPending}
                              onClick={() => handleActionClick(stage, "in_progress", true)}
                              className="w-full sm:w-auto border-primary/40 text-primary hover:bg-primary/5 shadow-sm"
                            >
                              <Edit3 className="size-3 mr-1.5" /> Perbarui Progres
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              isDisabled={isPending}
                              onClick={() => handleActionClick(stage, "pending")}
                              className="w-full sm:w-auto text-danger hover:bg-danger/10 hover:text-danger sm:ml-auto"
                            >
                              <RotateCcw className="size-3 mr-1.5" /> Batal Mulai
                            </Button>
                          </>
                        )}

                        {/* If completed or skipped: can return to pending */}
                        {(isCompleted || isSkipped) && (
                          <Button
                            variant="outline"
                            size="sm"
                            isDisabled={isPending}
                            onClick={() => handleActionClick(stage, "pending")}
                            className="w-full sm:w-auto hover:bg-warning-soft"
                          >
                            <RotateCcw className="size-3 mr-1.5" /> Reset ke Antrean
                          </Button>
                        )}

                        {/* Guard notification if previous stage is still pending */}
                        {!eligible && stage.status === "pending" && (
                          <span className="text-xs text-danger/80 flex items-center gap-1 mt-1.5">
                            <AlertCircle className="size-3 shrink-0" />
                            Selesaikan tahap sebelumnya terlebih dahulu untuk mengaktifkan tahap ini.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirmation & Entry Dialog */}
      <ConfirmDialog
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          isUpdatingProgressOnly ? `Perbarui Progres: ${selectedStage?.name}` :
          targetStatus === "in_progress" ? "Mulai Tahapan Proyek" :
          targetStatus === "completed" ? "Selesaikan Tahapan Proyek" :
          targetStatus === "skipped" ? "Lewati Tahapan Proyek" :
          "Kembalikan Tahapan ke Antrean"
        }
        confirmLabel={
          isUpdatingProgressOnly ? "Simpan Progres" :
          targetStatus === "in_progress" ? "Mulai" :
          targetStatus === "completed" ? "Selesaikan" :
          targetStatus === "skipped" ? "Lewati" :
          "Reset"
        }
        cancelLabel="Batal"
        variant={
          targetStatus === "completed" ? "success" :
          targetStatus === "skipped" ? "warning" :
          targetStatus === "pending" ? "danger" :
          "accent"
        }
        isPending={isPending}
        onConfirm={handleConfirm}
      >
        <div className="flex flex-col gap-4 mt-2">
          {!isUpdatingProgressOnly && (
            <p className="text-xs text-muted-foreground">
              Apakah Anda yakin ingin memproses tahapan <strong className="text-foreground">{selectedStage?.name}</strong>?
            </p>
          )}

          {/* Progress Percentage Configurator */}
          {targetStatus === "in_progress" && (
            <div className="bg-surface-secondary/60 border border-default p-3.5 rounded-xl flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label htmlFor="stage-percent" className="text-xs font-bold text-foreground">Persentase Capaian Progres:</label>
                <span className="text-sm font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                  {percentage}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="stage-percent"
                  type="range"
                  min="0"
                  max="100"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="w-full h-1.5 bg-default/50 rounded-lg appearance-none cursor-pointer accent-primary"
                  disabled={isPending}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={percentage}
                  onChange={(e) => {
                    let val = Number(e.target.value)
                    if (val < 0) val = 0
                    if (val > 100) val = 100
                    setPercentage(val)
                  }}
                  className="w-16 text-center text-xs font-bold border border-default rounded-md p-1 bg-surface text-foreground"
                  disabled={isPending}
                />
              </div>
              <p className="text-[10px] text-muted-foreground leading-normal">
                *Mengatur progres ke 100% akan otomatis memindahkan status tahapan ini menjadi Selesai (Completed).
              </p>
            </div>
          )}

          {/* Notes Input Field */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stage-notes" className="text-[11px] font-semibold text-muted-foreground">Catatan / Catatan Progres (Opsional):</label>
            <textarea
              id="stage-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs border border-default rounded-lg p-2.5 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
              placeholder={
                targetStatus === "in_progress" 
                  ? "Tulis aktivitas yang sedang dikerjakan pada tahap ini..." 
                  : "Masukkan keterangan hasil pengerjaan..."
              }
              rows={3}
              disabled={isPending}
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  )
}
