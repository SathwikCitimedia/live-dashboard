export function ActivityDate({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return <span className="text-muted-foreground">Unavailable</span>
  return (
    <time dateTime={date.toISOString()} className="block whitespace-nowrap">
      <span className="block">{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)}</span>
    </time>
  )
}
