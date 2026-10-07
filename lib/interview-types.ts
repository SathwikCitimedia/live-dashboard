import type { UsageSummary } from "@/lib/dashboard-types"
import type { PaginationData } from "@/lib/pagination-types"

export type InterviewRow = {
  id: number
  interview_id: string
  candidate_name: string | null
  candidate_email: string | null
  role: string | null
  status: string | null
  session_id: string | null
  api_consumption: string
  first_used: string | null
  last_used: string | null
}

export type InterviewsData = {
  summary: UsageSummary
  rows: InterviewRow[]
  pagination: PaginationData
  updatedAt: string
}

export type InterviewsApiResponse = InterviewsData | { error: string }
