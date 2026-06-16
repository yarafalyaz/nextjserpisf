export function PrintHeader({ title, period, companyName }: { title: string; period: string; companyName?: string }) {
  const printedAt = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  // Print-only header: hidden on screen, visible in print. Rendered as a
  // <header> landmark with aria-label so screen readers (and the print
  // outline tool) identify it as the document's print banner. The company
  // name is a <span> rather than an <h1> to avoid clashing with the
  // on-screen page <h1> — print should be a faithful copy of the page, not
  // introduce a competing heading level.
  return (
    <header
      aria-label="Header cetak laporan"
      className="hidden print:flex print:flex-row print:items-center print:justify-between mb-6 border-b border-default pb-4"
    >
      <span className="text-xl font-bold">{companyName || "Silengkap"}</span>
      <div className="text-right">
        <p className="text-lg font-semibold m-0">{title}</p>
        <p className="text-sm text-muted-foreground m-0">{period}</p>
        <p className="text-xs text-muted-foreground m-0">
          <span aria-hidden="true">Dicetak: </span>
          <time dateTime={new Date().toISOString()}>{printedAt}</time>
        </p>
      </div>
    </header>
  )
}
