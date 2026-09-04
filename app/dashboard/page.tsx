"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

type QueryResult = {
  name: string
  sql: string
  rowCount: number
  rows: unknown[]
}

type DashboardResponse =
  | {
      queries: QueryResult[]
    }
  | {
      error: string
    }

export default function DashboardPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [queries, setQueries] = useState<QueryResult[]>([])

  useEffect(() => {
    const loadQueries = async () => {
      try {
        const response = await fetch("/api/dashboard", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        })

        const body = (await response.json().catch(() => null)) as DashboardResponse

        if (!response.ok) {
          if (response.status === 401) {
            router.push("/?error=unauthorized")
            return
          }
          setError(body && "error" in body ? body.error : "Failed to load data")
          return
        }

        setQueries((body as { queries: QueryResult[] }).queries)
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
              <CardTitle className="text-base">{query.name}</CardTitle>
              <CardDescription>Rows: {query.rowCount}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded border bg-slate-950 p-2 text-xs text-slate-50">
                {query.sql}
              </pre>
              <pre className="overflow-x-auto rounded border bg-slate-100 p-2 text-xs text-slate-900 dark:bg-slate-950 dark:text-slate-50">
                {JSON.stringify(query.rows, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
