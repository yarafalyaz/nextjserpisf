export function PrintHeader({ title, period, companyName }: { title: string; period: string; companyName?: string }) {
  const printedAt = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="hidden print:block mb-6 border-b border-default pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{companyName || 'Silengkap'}</h1>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted">{period}</p>
          <p className="text-xs text-muted">Dicetak: {printedAt}</p>
        </div>
      </div>
    </div>
  )
}
