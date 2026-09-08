"use client"

import { Fragment, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

import { ActivityDate } from "@/components/activity-date"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { useInterviews } from "@/hooks/use-interviews"
import type { InterviewRow, JsonValue } from "@/lib/interview-types"

type DetailField = { key: keyof InterviewRow; label: string; format?: "date" | "recorded" | "json" }

const detailGroups: { title: string; fields: DetailField[] }[] = [
  { title: "Contact information", fields: [
    { key: "id", label: "Record ID" },
    { key: "candidate_id", label: "Candidate ID" },
    { key: "candidate_phones", label: "Candidate phones" },
    { key: "recruiter_phone", label: "Recruiter phone" },
    { key: "hr_user_id", label: "HR user ID" },
    { key: "hr_phone", label: "HR phone" },
    { key: "interview_link", label: "Interview link" },
  ] },
  { title: "Lifecycle dates", fields: [
    { key: "timezone", label: "Interview timezone" },
    { key: "created_at", label: "Created", format: "date" },
    { key: "started_at", label: "Started", format: "date" },
    { key: "completed_at", label: "Completed", format: "date" },
    { key: "updated_at", label: "Updated", format: "date" },
    { key: "abandoned_at", label: "Abandoned", format: "recorded" },
  ] },
  { title: "Presence and connection", fields: [
    { key: "presence_status", label: "Presence status" },
    { key: "current_socket_id", label: "Current socket ID" },
    { key: "last_heartbeat_at", label: "Last heartbeat", format: "recorded" },
    { key: "last_socket_disconnect_at", label: "Last socket disconnect", format: "recorded" },
    { key: "disconnect_reason", label: "Disconnect reason" },
    { key: "reconnect_count", label: "Reconnect count" },
  ] },
  { title: "Configuration", fields: [
    { key: "digital_human_enabled", label: "Digital human enabled" },
    { key: "is_demo", label: "Demo interview" },
    { key: "challenges", label: "Challenges" },
    { key: "widget_id", label: "Widget ID" },
    { key: "stream_response_config", label: "Stream response configuration", format: "json" },
  ] },
]

function Value({ value }: { value: JsonValue | undefined }) {
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">Unavailable</span>
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>
  if (Array.isArray(value)) return value.length ? (
    <ul className="list-inside list-disc space-y-1">{value.map((item, index) => <li key={index}><Value value={item} /></li>)}</ul>
  ) : <span className="text-muted-foreground">None</span>
  if (typeof value === "object") return <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(value, null, 2)}</pre>
  return <>{value}</>
}

function InterviewDetails({ row }: { row: InterviewRow }) {
  return (
    <div className="grid min-w-0 gap-8 p-4 @lg:grid-cols-2 @4xl:grid-cols-4">
      {detailGroups.map((group) => (
        <section key={group.title} aria-label={group.title} className="min-w-0 space-y-4">
          <h3 className="font-semibold">{group.title}</h3>
          <dl className="space-y-4">
            {group.fields.map(({ key, label, format }) => (
              <div key={key} className="min-w-0 space-y-1">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="whitespace-normal [overflow-wrap:anywhere]">
                  {format === "date" ? <ActivityDate value={row[key] as string | null} />
                    : format === "json" && row[key] !== null ? <pre className="whitespace-pre-wrap [overflow-wrap:anywhere]">{JSON.stringify(row[key], null, 2)}</pre>
                    : <Value value={row[key]} />}
                  {format === "recorded" && row[key] !== null && <span className="mt-1 block text-xs text-muted-foreground">As recorded · no timezone</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
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
          <CardDescription>Candidate details and interview activity, newest first. Expand a row for all details.</CardDescription>
          {timezone && <p className="mt-2 text-xs text-muted-foreground">Times shown in {timezone}, except timestamps marked as recorded.</p>}
        </CardHeader>
        <CardContent className="@container min-w-0 space-y-6">
          {error && (
            <Alert variant="destructive" className="p-4">
              <AlertTitle>Interviews could not be updated</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{error}{data ? " Your last loaded interviews are still shown below." : ""}</span>
                <Button variant="outline" size="sm" onClick={retry} disabled={isLoading}>Retry interviews</Button>
              </AlertDescription>
            </Alert>
          )}
          <Table className="min-w-260 table-fixed text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Interview ID</TableHead>
                <TableHead className="w-52">Candidate</TableHead>
                <TableHead className="w-36">Role</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-36">Scheduled time</TableHead>
                <TableHead className="w-32">Recruiter</TableHead>
                <TableHead className="w-24">Source</TableHead>
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
                    <TableCell className="py-5"><ActivityDate value={row.interview_time} /></TableCell>
                    <TableCell className="py-5"><Value value={row.recruiter_name} /></TableCell>
                    <TableCell className="py-5"><Value value={row.source} /></TableCell>
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
              )) : <TableRow><TableCell colSpan={8} className="h-36 text-center text-muted-foreground">{data ? "No interviews yet." : "Interviews are currently unavailable. Please retry."}</TableCell></TableRow>}
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
