import { DeliveryDate } from "@/components/delivery-date"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardData } from "@/lib/dashboard-types"

const formatCount = (value: string) => new Intl.NumberFormat("en-US").format(BigInt(value))

export function UsageSummary({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const timezone = data ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ") : null

  return (
    <section aria-label="API usage summary" aria-busy={isLoading} className="min-w-0">
      <Card className="gap-0 py-0 [--card-spacing:--spacing(6)]">
        <CardContent className="px-0">
          <dl className="-mt-px -ml-px grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 [&>div]:border-t [&>div]:border-l">
            {([
              ["api_consumption_all", "Total API consumption"],
              ["distinct_interviews", "Distinct interviews"],
            ] as const).map(([field, label]) => (
              <div key={field} className="min-w-0 bg-card p-6">
                <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-6 break-all text-4xl font-semibold tracking-tight tabular-nums">
                  {data ? formatCount(data.summary[field])
                    : isLoading ? <Skeleton className="h-10 w-32 max-w-full" />
                    : <span className="text-sm font-normal text-muted-foreground">Unavailable</span>}
                </dd>
              </div>
            ))}
            {([
              ["first_used", "First used"],
              ["last_used", "Last used"],
            ] as const).map(([field, label]) => (
              <div key={field} className="min-w-0 bg-card p-6">
                <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-6 min-w-0 text-sm [overflow-wrap:anywhere]">
                  {!data && isLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28 max-w-full" />
                      <Skeleton className="h-3 w-20 max-w-full" />
                    </div>
                  ) : <DeliveryDate value={data?.summary[field] ?? null} />}
                </dd>
              </div>
            ))}
          </dl>
          {data && BigInt(data.summary.api_consumption_all) === BigInt(0) && <p className="border-t p-6 text-sm text-muted-foreground">No API usage yet.</p>}
        </CardContent>
        {data && (
          <CardFooter className="flex-wrap justify-between gap-2 py-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">Usage last updated {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(data.updatedAt))} · {timezone}</p>
            {isLoading && <p role="status" className="text-xs text-muted-foreground">Updating usage…</p>}
          </CardFooter>
        )}
        {data && <p className="border-t px-6 py-3 text-xs text-muted-foreground">Usage times shown in {timezone}, except timestamps marked as recorded.</p>}
      </Card>
    </section>
  )
}
