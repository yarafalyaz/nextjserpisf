/**
 * Narrative description block for professional accounting reports.
 * Renders an explanatory paragraph before the report tables,
 * matching the style of Accurate / Jurnal / Zahir printed reports.
 */
export function ReportNarration({ text }: { text: string }) {
  return (
    <div className="report-narration" data-report-narration={text}>
      <p>{text}</p>
    </div>
  )
}
