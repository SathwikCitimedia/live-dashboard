"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

import type { DashboardApiResponse, DashboardQuery, KeyUsageRow, QueryName } from "@/lib/dashboard-types"

const queryMetaByName: Record<QueryName, string> = {
  query_1: "API usage: total and environment split",
  query_2: "API usage by environment and key",
}

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queries, setQueries] = useState<DashboardQuery[]>([])

  const typedRows = (queryName: QueryName, rows: unknown[]) => {
    if (queryName === "query_1" || queryName === "query_2") {
      return rows as KeyUsageRow[]
    }
    return []
  }

  const formatRequestCount = (value: string | number) =>
    new Intl.NumberFormat("en-US").format(typeof value === "string" ? Number.parseInt(value, 10) : value)

  const tableTime = (value: string) => new Date(value).toLocaleString()

  const resolveTitle = (name: QueryName) => {
    return queryMetaByName[name] ?? "Query result"
  }

  useEffect(() => {
    const loadQueries = async () => {
      try {
        const response = await fetch("/api/dashboard", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })

        const body = (await response.json().catch(() => null)) as DashboardApiResponse

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/?error=unauthorized")
            return
          }
          setError(body && "error" in body ? body.error : "Failed to load data")
          return
        }

        setQueries((body as { queries: DashboardQuery[] }).queries)
      } catch {
        setError("Could not contact the dashboard endpoint.")
      } finally {
        setIsLoading(false)
      }
    }

    loadQueries()
  }, [router])

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } finally {
      router.push("/")
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading dashboard data...
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Database Logs Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Two SQL statements are executed on each refresh.
          </p>
        </div>
        <Button variant="outline" onClick={logout}>
          Logout
        </Button>
      </header>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {queries.map((query) => (
          <Card key={query.name}>
            <CardHeader>
              <CardTitle className="text-base">{resolveTitle(query.name)}</CardTitle>
              <CardDescription>Rows: {query.rowCount}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-2 py-2">Environment / Key</th>
                      <th className="px-2 py-2">Total Requests</th>
                      <th className="px-2 py-2">First Used</th>
                      <th className="px-2 py-2">Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typedRows(query.name, query.rows).map((row) => (
                      <tr key={row.environment_and_key} className="border-b last:border-0">
                        <td className="px-2 py-2">{row.environment_and_key}</td>
                        <td className="px-2 py-2 font-mono">{formatRequestCount(row.total_requests)}</td>
                        <td className="px-2 py-2">{tableTime(row.first_used)}</td>
                        <td className="px-2 py-2">{tableTime(row.last_used)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
