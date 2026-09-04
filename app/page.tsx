"use client"

import { type FormEvent, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("admin@example.com")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    const paramsError = searchParams.get("error")
    if (paramsError) {
      setError("Session expired. Please log in again.")
    }
  }, [searchParams])

  useEffect(() => {
    const ensureSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { method: "GET", cache: "no-store" })
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
        body: JSON.stringify({ email, password }),
      })

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string
          }
        | null

      if (!response.ok) {
        setError(data?.error ?? "Invalid credentials")
        return
      }

      router.push("/dashboard")
    } catch {
      setError("Could not contact the login endpoint.")
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
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm dark:bg-slate-900">
        <h1 className="mb-4 text-lg font-semibold">DB Logs Viewer</h1>
        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Email</span>
            <Input
              required
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Password</span>
            <Input
              required
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  )
}
