import { StatusChip } from "@/components/ui/status-chip"
import type { CrmTicketSlaPrimaryState } from "@/lib/reports/crm-ticket-sla"

/**
 * 001-U atas F-2026-10-24-135-S: satu tiket satu lencana SLA dari
 * `primaryState` server (keadaan paling parah). Teks/tone persis spec
 * konsumen; keadaan dalam SLA tidak berlencana. UI tidak menilai ulang.
 */
export function TicketSlaChip({
  primaryState,
}: Readonly<{ primaryState: CrmTicketSlaPrimaryState }>) {
  if (primaryState === "LEWAT_RESPONS" || primaryState === "LEWAT_RESOLUSI") {
    return (
      <StatusChip status={primaryState} customLabel="Lewat SLA" customTone="danger" />
    )
  }
  if (primaryState === "MENDEKATI_RESPONS" || primaryState === "MENDEKATI_RESOLUSI") {
    return (
      <StatusChip
        status={primaryState}
        customLabel="Mendekati SLA"
        customTone="warning"
      />
    )
  }
  return null
}
