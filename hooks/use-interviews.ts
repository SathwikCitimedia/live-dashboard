"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import type { InterviewsApiResponse, InterviewsData } from "@/lib/interview-types"

export function useInterviews() {
  const router = useRouter()
  const [data, setData] = useState<InterviewsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const latestRequest = useRef(0)
  const requestedPagination = useRef({ page: 1, pageSize: 10 })

  const load = useCallback(async (page: number, pageSize: number) => {
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const requestId = ++latestRequest.current
    requestedPagination.current = { page, pageSize }
    try {
      const response = await fetch(`/api/interviews?page=${page}&pageSize=${pageSize}`, {
        credentials: "include", cache: "no-store", signal: abort.signal,
      })
      if (requestId !== latestRequest.current || abort.signal.aborted) return
      if (response.status === 401) {
        router.replace("/?error=unauthorized")
        return
      }
      const body = await response.json() as InterviewsApiResponse
      if (!response.ok || "error" in body) throw new Error("Unable to load interviews")
      if (requestId === latestRequest.current && !abort.signal.aborted) {
        requestedPagination.current = body.pagination
        setData(body)
      }
    } catch {
      if (requestId === latestRequest.current && !abort.signal.aborted) {
        setError("We couldn't update interviews. Please try again.")
      }
    } finally {
      if (requestId === latestRequest.current && !abort.signal.aborted) setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    // Loading starts true; subsequent state changes happen after the request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(1, 10)
    return () => controller.current?.abort()
  }, [load])

  const request = (page: number, pageSize: number) => {
    setIsLoading(true)
    setError(null)
    void load(page, pageSize)
  }

  return {
    data, isLoading, error, request,
    refresh: () => request(data?.pagination.page ?? 1, data?.pagination.pageSize ?? 10),
    retry: () => request(requestedPagination.current.page, requestedPagination.current.pageSize),
    cancel: () => controller.current?.abort(),
  }
}
