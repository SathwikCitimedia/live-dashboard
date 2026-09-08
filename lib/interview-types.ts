import type { DashboardData } from "@/lib/dashboard-types"

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type InterviewRow = {
  id: number
  interview_id: string | null
  candidate_id: string | null
  candidate_name: string | null
  candidate_email: string | null
  candidate_phones: JsonValue[] | null
  role: string | null
  status: string | null
  interview_time: string | null
  recruiter_name: string | null
  recruiter_phone: string | null
  hr_user_id: string | null
  hr_phone: string | null
  source: string | null
  timezone: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string | null
  // These are database wall-clock timestamps, not ISO instants; never convert them to Date.
  last_heartbeat_at: string | null
  last_socket_disconnect_at: string | null
  abandoned_at: string | null
  presence_status: string | null
  current_socket_id: string | null
  disconnect_reason: string | null
  reconnect_count: number | null
  digital_human_enabled: boolean | null
  is_demo: boolean | null
  challenges: JsonValue[] | null
  widget_id: string | null
  interview_link: string | null
  stream_response_config: JsonValue
}

export type InterviewsData = {
  rows: InterviewRow[]
  pagination: DashboardData["pagination"]
  updatedAt: string
}

export type InterviewsApiResponse = InterviewsData | { error: string }
