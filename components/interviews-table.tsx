"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { DeliveryDate } from "@/components/delivery-date"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { useInterviews } from "@/hooks/use-interviews"
import type { InterviewRow } from "@/lib/interview-types"

const formatCount = (value: string) => new Intl.NumberFormat("en-US").format(BigInt(value))

function Value({ value }: { value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">Unavailable</span>
  return <>{value}</>
}

function InterviewDetails({ row }: { row: InterviewRow }) {
  return (
    <dl className="grid min-w-0 gap-8 p-4 @lg:grid-cols-2">
      {([
        ["id", "Record ID"],
        ["session_id", "Session ID"],
      ] as const).map(([field, label]) => (
        <div key={field} className="min-w-0 space-y-1">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="whitespace-normal [overflow-wrap:anywhere]"><Value value={row[field]} /></dd>
        </div>
      ))}
    </dl>
  )
}

export function InterviewsTable({ interviews }: { interviews: ReturnType<typeof useInterviews> }) {
  const { data, isLoading, error, request, retry } = interviews
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set())
  const pagination = data?.pagination
  const timezone = data ? Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll("_", " ") : null
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const changePage = (page: number, pageSize: number) => {
    setExpanded(new Set())
    request(page, pageSize)
  }

  return (
    <section aria-label="Interviews" aria-busy={isLoading} className="min-w-0 space-y-4">
      <Card className="min-w-0 [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle className="text-lg">Interviews</CardTitle>
          <CardDescription>API consumption by interview, latest activity first. Expand a row for record and session IDs.</CardDescription>
          {timezone && <p className="mt-2 text-xs text-muted-foreground">Times shown in {timezone}, except timestamps marked as recorded.</p>}
        </CardHeader>
        <CardContent className="@container min-w-0 space-y-6">
          {error && (
            <Alert variant="destructive" className="p-4">
              <AlertTitle>Dashboard could not be updated</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}{data ? " Your last loaded summary and interviews are still shown." : ""}</span>
                <Button variant="outline" size="sm" onClick={retry} disabled={isLoading}>Retry</Button>
              </AlertDescription>
            </Alert>
          )}
          <Table className="min-w-300 table-fixed text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Interview ID</TableHead>
                <TableHead className="w-52">Candidate</TableHead>
                <TableHead className="w-36">Role</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36">API consumption</TableHead>
                <TableHead className="w-40">First used</TableHead>
                <TableHead className="w-40">Last used</TableHead>
                <TableHead className="w-24">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && isLoading ? Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index}>{Array.from({ length: 8 }, (_, col) => <TableCell key={col} className="py-5"><Skeleton className="h-8 w-full" /></TableCell>)}</TableRow>
              )) : data?.rows.length ? data.rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow className="[&>td]:whitespace-normal [&>td]:[overflow-wrap:anywhere]">
                    <TableCell className="py-5 font-medium"><Value value={row.interview_id} /></TableCell>
                    <TableCell className="py-5"><p className="font-medium"><Value value={row.candidate_name} /></p><p className="mt-1 text-xs text-muted-foreground"><Value value={row.candidate_email} /></p></TableCell>
                    <TableCell className="py-5"><Value value={row.role} /></TableCell>
                    <TableCell className="py-5"><Value value={row.status} /></TableCell>
                    <TableCell className="py-5 tabular-nums">{formatCount(row.api_consumption)}</TableCell>
                    <TableCell className="py-5"><DeliveryDate value={row.first_used} /></TableCell>
                    <TableCell className="py-5"><DeliveryDate value={row.last_used} /></TableCell>
                    <TableCell className="py-5">
                      <Button variant="ghost" size="sm" aria-expanded={expanded.has(row.id)} aria-controls={`interview-details-${row.id}`} aria-label={`${expanded.has(row.id) ? "Hide" : "Show"} details for interview ${row.interview_id ?? row.id}`} onClick={() => toggle(row.id)}>
                        {expanded.has(row.id) ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}Details
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow hidden={!expanded.has(row.id)} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={8} className="p-0">
                      <div id={`interview-details-${row.id}`} hidden={!expanded.has(row.id)} className="sticky left-0 w-[100cqw]">
                        {expanded.has(row.id) && <InterviewDetails row={row} />}
                      </div>
                    </TableCell>
                  </TableRow>
                </Fragment>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} className="p-0 text-center text-muted-foreground">
                    <div className="sticky left-0 flex h-36 w-[100cqw] items-center justify-center whitespace-normal px-4">
                      {data ? "No interviews yet." : "Interviews are currently unavailable. Please retry."}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {pagination && (
            <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Showing {pagination.totalRows === 0 ? "0" : `${((pagination.page - 1) * pagination.pageSize + 1).toLocaleString("en-US")}–${Math.min(pagination.page * pagination.pageSize, pagination.totalRows).toLocaleString("en-US")}`} of {pagination.totalRows.toLocaleString("en-US")}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span id="interviews-page-size-label" className="text-xs text-muted-foreground">Per page</span>
                  <Select value={String(pagination.pageSize)} onValueChange={(value) => { if (value) changePage(1, Number(value)) }} disabled={isLoading}>
                    <SelectTrigger aria-labelledby="interviews-page-size-label"><SelectValue /></SelectTrigger>
                    <SelectContent>{[10, 25, 50].map((size) => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {pagination.totalPages > 1 && (
                  <Pagination aria-label="Interview pagination" className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem><Button variant="outline" size="sm" disabled={isLoading || pagination.page === 1} onClick={() => changePage(pagination.page - 1, pagination.pageSize)}>Previous</Button></PaginationItem>
                      <PaginationItem><span className="px-2 text-xs tabular-nums" aria-current="page">{pagination.page.toLocaleString("en-US")} / {pagination.totalPages.toLocaleString("en-US")}</span></PaginationItem>
                      <PaginationItem><Button variant="outline" size="sm" disabled={isLoading || pagination.page === pagination.totalPages} onClick={() => changePage(pagination.page + 1, pagination.pageSize)}>Next</Button></PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </div>
          )}
          {isLoading && data && <p role="status" className="text-xs text-muted-foreground">Updating interviews…</p>}
        </CardContent>
      </Card>
      {data && <p className="text-xs text-muted-foreground" aria-live="polite">Interviews last updated {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(data.updatedAt))} · {timezone}</p>}
    </section>
  )
}
