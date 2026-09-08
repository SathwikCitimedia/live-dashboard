import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardData } from "@/lib/dashboard-types"

const formatCount = (value: string) => new Intl.NumberFormat("en-US").format(BigInt(value))

export function UsageSummary({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const timezone = data ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ") : null

  return (
    <section aria-label="Usage summary" aria-busy={isLoading} className="min-w-0">
      <Card className="gap-0 py-0 [--card-spacing:--spacing(6)]">
        <CardContent className="px-0">
          <dl className="-mt-px -ml-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] [&>div]:border-t [&>div]:border-l">
            <div className="min-w-0 bg-card p-6 sm:col-span-2 lg:col-span-1">
              <dt className="space-y-2">
                <span className="block text-sm font-medium text-muted-foreground">Total requests</span>
                <span className="block text-xs text-muted-foreground">All-time usage across your configured API keys</span>
              </dt>
              <dd className="mt-6 break-all text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                {data ? formatCount(data.totalRequests)
                  : isLoading ? <Skeleton className="h-12 w-48 max-w-full" />
                  : <span className="text-sm font-normal text-muted-foreground">Unavailable</span>}
              </dd>
            </div>
            {data ? data.rows.map((row) => (
              <div key={row.environment_and_key} className="flex min-w-0 flex-col justify-between gap-6 bg-card p-6">
                <dt className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{row.environment_and_key}</dt>
                <dd className="break-all text-3xl font-semibold tracking-tight tabular-nums">{formatCount(row.total_requests)}</dd>
              </div>
            )) : isLoading ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex min-w-0 flex-col justify-between gap-6 bg-card p-6">
                <dt><span className="sr-only">Loading usage group</span><Skeleton className="h-4 w-32 max-w-full" /></dt>
                <dd><Skeleton className="h-9 w-24 max-w-full" /></dd>
              </div>
            )) : null}
          </dl>
          {data && data.rows.length === 0 && <p className="border-t p-6 text-sm text-muted-foreground">No usage yet. Counts will appear here when your API keys are used.</p>}
        </CardContent>
        {data && (
          <CardFooter className="flex-wrap justify-between gap-2 py-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">Usage last updated {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(data.updatedAt))} · {timezone}</p>
            {isLoading && <p role="status" className="text-xs text-muted-foreground">Updating usage…</p>}
          </CardFooter>
        )}
      </Card>
    </section>
  )
}
