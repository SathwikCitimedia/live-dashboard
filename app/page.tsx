"use client"

import { type FormEvent, Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  const displayedError =
    error ??
    (searchParams.get("error")
      ? "Session expired. Please sign in again."
      : null)

  useEffect(() => {
    const ensureSession = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        })
        const payload = (await response.json().catch(() => null)) as {
          authenticated?: boolean
        }
        if (payload?.authenticated) {
          router.push("/dashboard")
          return
        }
      } catch {
        // Ignore and remain on login.
      } finally {
        setIsCheckingSession(false)
      }
    }

    ensureSession()
  }, [router])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })

      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null

      if (!response.ok) {
        setError(data?.error ?? "Invalid credentials")
        return
      }

      router.push("/dashboard")
    } catch {
      setError("We couldn't sign you in. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Checking session...
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <Card className="w-full max-w-sm [--card-spacing:--spacing(6)]">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">Usage Dashboard</h1>
          </CardTitle>
          <CardDescription>
            View your API usage and recent activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-2 text-sm">
              <Label htmlFor="username">Username</Label>
              <Input
                required
                name="text"
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="space-y-2 text-sm">
              <Label htmlFor="password">Password</Label>
              <Input
                required
                type="password"
                name="password"
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {displayedError ? (
              <Alert variant="destructive">
                <AlertDescription>{displayedError}</AlertDescription>
              </Alert>
            ) : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
