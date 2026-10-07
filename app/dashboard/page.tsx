"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"

import { InterviewsTable } from "@/components/interviews-table"
import { UsageSummary } from "@/components/usage-summary"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useInterviews } from "@/hooks/use-interviews"

export default function DashboardPage() {
  const router = useRouter()
  const interviews = useInterviews()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const isRefreshing = interviews.isLoading
  const logout = async () => {
    setIsSigningOut(true)
    setSignOutError(null)
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      if (!response.ok) throw new Error("Sign out failed")
      interviews.cancel()
      router.replace("/")
    } catch {
      setSignOutError("We couldn't sign you out. Please try again.")
      setIsSigningOut(false)
    }
  }

  return (
    <main className="flex min-h-svh w-full flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usage Dashboard</h1>
          <p className="text-sm text-muted-foreground">View API consumption and the interviews behind it.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={interviews.refresh} disabled={isRefreshing || isSigningOut}>
            <RefreshCw className={isRefreshing ? "size-4 animate-spin" : "size-4"} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button variant="ghost" onClick={logout} disabled={isSigningOut}>{isSigningOut ? "Signing out..." : "Sign out"}</Button>
        </div>
      </header>

      {signOutError && (
        <Alert variant="destructive" className="p-4">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{signOutError}</span>
            <Button variant="outline" size="sm" onClick={logout} disabled={isSigningOut}>Retry sign out</Button>
          </AlertDescription>
        </Alert>
      )}

      <UsageSummary data={interviews.data} isLoading={interviews.isLoading} />
      <InterviewsTable interviews={interviews} />
    </main>
  )
}
