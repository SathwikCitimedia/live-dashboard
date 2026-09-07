"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DashboardApiResponse, DashboardData } from "@/lib/dashboard-types"

const formatCount = (value: string | number) => new Intl.NumberFormat("en-US").format(BigInt(value))

function ActivityDate({ value }: { value: string | null }) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return <span className="text-muted-foreground">Unavailable</span>
  return (
    <time dateTime={date.toISOString()} className="block whitespace-nowrap">
      <span className="block">{new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date)}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(date)}</span>
    </time>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const latestRequest = useRef(0)

  const loadUsage = useCallback(async (page: number, pageSize: number) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestId = ++latestRequest.current
    try {
      const response = await fetch(`/api/dashboard?page=${page}&pageSize=${pageSize}`, {
        credentials: "include", cache: "no-store", signal: abort.signal,
      })
      if (requestId !== latestRequest.current || abort.signal.aborted) return
      if (response.status === 401) {
        router.replace("/?error=unauthorized")
        return
      }
      const body = await response.json() as DashboardApiResponse
      if (!response.ok || "error" in body) throw new Error("Unable to load usage")
      if (requestId === latestRequest.current && !abort.signal.aborted) setData(body)
    } catch {
      if (requestId === latestRequest.current && !abort.signal.aborted) {
        setError("We couldn't update your usage. Please try again.")
      }
    } finally {
      if (requestId === latestRequest.current && !abort.signal.aborted) setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    // Loading is initialized above; this function updates state only after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsage(1, 10)
    return () => controller.current?.abort()
  }, [loadUsage])

  const requestUsage = (page: number, pageSize: number) => {
    setIsLoading(true)
    setError(null)
    void loadUsage(page, pageSize)
  }
  const refresh = () => requestUsage(data?.pagination.page ?? 1, data?.pagination.pageSize ?? 10)
  const logout = async () => {
    setIsSigningOut(true)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      if (!response.ok) throw new Error("Sign out failed")
      controller.current?.abort()
      router.replace("/")
    } catch {
      setError("We couldn't sign you out. Please try again.")
      setIsSigningOut(false)
    }
  }

  const pagination = data?.pagination
  const timezone = data ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ") : null

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usage Dashboard</h1>
          <p className="text-sm text-muted-foreground">View your API usage and recent activity.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={isLoading || isSigningOut}>
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
            {isLoading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button variant="ghost" onClick={logout} disabled={isSigningOut}>{isSigningOut ? "Signing out..." : "Sign out"}</Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="p-4">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}{data ? " Your last loaded usage is still shown below." : ""}</span>
            <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Usage summary" aria-busy={isLoading}>
        <Card className="[--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Total requests</CardTitle>
            <CardDescription>All-time usage across your configured API keys</CardDescription>
          </CardHeader>
          <CardContent>
            {data ? <p className="break-all text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatCount(data.totalRequests)}</p>
              : isLoading ? <Skeleton className="h-12 w-48" /> : <p className="text-muted-foreground">Unavailable</p>}
          </CardContent>
        </Card>
      </section>

      <section aria-label="Usage breakdown" aria-busy={isLoading}>
        <Card className="[--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-lg">Usage breakdown</CardTitle>
            <CardDescription>Requests and activity by environment and API key.</CardDescription>
            {timezone && <p className="mt-2 text-xs text-muted-foreground">Times shown in {timezone}</p>}
          </CardHeader>
          <CardContent className="space-y-6">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56">Environment / Key</TableHead>
                  <TableHead className="min-w-28 text-right">Requests</TableHead>
                  <TableHead className="min-w-40 pl-8">First activity</TableHead>
                  <TableHead className="min-w-40 pl-8">Latest activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data && isLoading ? Array.from({ length: 3 }, (_, row) => (
                  <TableRow key={row}>{Array.from({ length: 4 }, (_, col) => <TableCell key={col} className="py-5"><Skeleton className="h-8 w-full" /></TableCell>)}</TableRow>
                )) : data?.rows.length ? data.rows.map((row) => (
                  <TableRow key={row.environment_and_key}>
                    <TableCell className="py-5 font-medium">{row.environment_and_key}</TableCell>
                    <TableCell className="py-5 text-right font-medium tabular-nums">{formatCount(row.total_requests)}</TableCell>
                    <TableCell className="py-5 pl-8"><ActivityDate value={row.first_used} /></TableCell>
                    <TableCell className="py-5 pl-8"><ActivityDate value={row.last_used} /></TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={4} className="h-36 text-center text-muted-foreground">{data ? "No usage yet. Activity will appear here when your API keys are used." : "Usage is currently unavailable. Please retry."}</TableCell></TableRow>}
              </TableBody>
            </Table>

            {pagination && (
              <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Showing {pagination.totalRows === 0 ? "0" : `${formatCount((pagination.page - 1) * pagination.pageSize + 1)}–${formatCount(Math.min(pagination.page * pagination.pageSize, pagination.totalRows))}`} of {formatCount(pagination.totalRows)}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span id="page-size-label" className="text-xs text-muted-foreground">Per page</span>
                    <Select value={String(pagination.pageSize)} onValueChange={(value) => { if (value) requestUsage(1, Number(value)) }} disabled={isLoading}>
                      <SelectTrigger aria-labelledby="page-size-label"><SelectValue /></SelectTrigger>
                      <SelectContent>{[10, 25, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {pagination.totalPages > 1 && (
                    <Pagination className="mx-0 w-auto">
                      <PaginationContent>
                        <PaginationItem><Button variant="outline" size="sm" disabled={isLoading || pagination.page === 1} onClick={() => requestUsage(pagination.page - 1, pagination.pageSize)}>Previous</Button></PaginationItem>
                        <PaginationItem><span className="px-2 text-xs tabular-nums" aria-current="page">{formatCount(pagination.page)} / {formatCount(pagination.totalPages)}</span></PaginationItem>
                        <PaginationItem><Button variant="outline" size="sm" disabled={isLoading || pagination.page === pagination.totalPages} onClick={() => requestUsage(pagination.page + 1, pagination.pageSize)}>Next</Button></PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
      {data && <p className="text-xs text-muted-foreground" aria-live="polite">Last updated {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(data.updatedAt))} · {timezone}</p>}
    </main>
  )
}
