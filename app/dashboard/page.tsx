"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import { InterviewsTable } from "@/components/interviews-table"
import { UsageSummary } from "@/components/usage-summary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { DashboardApiResponse, DashboardData } from "@/lib/dashboard-types"
import { useInterviews } from "@/hooks/use-interviews"

export default function DashboardPage() {
  const router = useRouter()
  const interviews = useInterviews()
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const latestRequest = useRef(0)

  const loadUsage = useCallback(async () => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestId = ++latestRequest.current
    try {
      const response = await fetch("/api/dashboard", {
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
    void loadUsage()
    return () => controller.current?.abort()
  }, [loadUsage])

  const refreshUsage = () => {
    setIsLoading(true)
    setError(null)
    void loadUsage()
  }
  const refresh = () => {
    refreshUsage()
    interviews.refresh()
  }
  const isRefreshing = isLoading || interviews.isLoading
  const logout = async () => {
    setIsSigningOut(true)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      if (!response.ok) throw new Error("Sign out failed")
      controller.current?.abort()
      interviews.cancel()
      router.replace("/")
    } catch {
      setError("We couldn't sign you out. Please try again.")
      setIsSigningOut(false)
    }
  }

  return (
    <main className="flex min-h-svh w-full flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usage Dashboard</h1>
          <p className="text-sm text-muted-foreground">View your API usage and interview activity.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={isRefreshing || isSigningOut}>
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button variant="ghost" onClick={logout} disabled={isSigningOut}>{isSigningOut ? "Signing out..." : "Sign out"}</Button>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="p-4">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}{data ? " Your last loaded usage is still shown below." : ""}</span>
            <Button variant="outline" size="sm" onClick={refreshUsage} disabled={isLoading}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <UsageSummary data={data} isLoading={isLoading} />
      <InterviewsTable interviews={interviews} />
    </main>
  )
}
