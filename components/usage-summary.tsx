import { DeliveryDate } from "@/components/delivery-date"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardData, WebhookUsageRow } from "@/lib/dashboard-types"

const formatCount = (value: string) => new Intl.NumberFormat("en-US").format(BigInt(value))

function DeliveryDates({ row, isLoading = false }: { row?: WebhookUsageRow; isLoading?: boolean }) {
  return (
    <dl className="mt-6 space-y-4 text-sm">
      {([
        ["first_used", "First delivery"],
        ["last_used", "Last delivery"],
      ] as const).map(([field, label]) => (
        <div key={field} className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-28 max-w-full" />
                <Skeleton className="h-3 w-20 max-w-full" />
              </div>
            ) : <DeliveryDate value={row?.[field] ?? null} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function UsageSummary({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const timezone = data ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ") : null

  return (
    <section aria-label="Successful webhook deliveries" aria-busy={isLoading} className="min-w-0">
      <Card className="gap-0 py-0 [--card-spacing:--spacing(6)]">
        <CardContent className="px-0">
          <dl className="-mt-px -ml-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] [&>div]:border-t [&>div]:border-l">
            <div className="min-w-0 bg-card p-6 sm:col-span-2 lg:col-span-1">
              <dt className="space-y-2">
                <span className="block text-sm font-medium text-muted-foreground">Successful webhook deliveries</span>
                <span className="block text-xs text-muted-foreground">All-time successful deliveries across your configured API keys</span>
              </dt>
              <dd>
                <div className="mt-6 break-all text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                  {data ? formatCount(data.total.webhook_deliveries)
                    : isLoading ? <Skeleton className="h-12 w-48 max-w-full" />
                    : <span className="text-sm font-normal text-muted-foreground">Unavailable</span>}
                </div>
                <DeliveryDates row={data?.total} isLoading={!data && isLoading} />
              </dd>
            </div>
            {data ? data.rows.map((row) => (
              <div key={row.environment_and_key} className="min-w-0 bg-card p-6">
                <dt className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{row.environment_and_key}</dt>
                <dd>
                  <div className="mt-6 break-all text-3xl font-semibold tracking-tight tabular-nums">{formatCount(row.webhook_deliveries)}</div>
                  <DeliveryDates row={row} />
                </dd>
              </div>
            )) : isLoading ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-w-0 bg-card p-6">
                <dt><span className="sr-only">Loading webhook delivery group</span><Skeleton className="h-4 w-32 max-w-full" /></dt>
                <dd>
                  <Skeleton className="mt-6 h-9 w-24 max-w-full" />
                  <DeliveryDates isLoading />
                </dd>
              </div>
            )) : null}
          </dl>
          {data && data.rows.length === 0 && <p className="border-t p-6 text-sm text-muted-foreground">No successful webhook deliveries yet. Counts will appear here when webhooks are delivered successfully.</p>}
        </CardContent>
        {data && (
          <CardFooter className="flex-wrap justify-between gap-2 py-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">Deliveries last updated {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(data.updatedAt))} · {timezone}</p>
            {isLoading && <p role="status" className="text-xs text-muted-foreground">Updating deliveries…</p>}
          </CardFooter>
        )}
        {data && <p className="border-t px-6 py-3 text-xs text-muted-foreground">Delivery times shown in {timezone}, except timestamps marked as recorded.</p>}
      </Card>
    </section>
  )
}
