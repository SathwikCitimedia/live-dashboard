export type UsageSummary = {
  api_consumption_all: string
  distinct_interviews: string
  first_used: string | null
  last_used: string | null
}

export type DashboardData = {
  summary: UsageSummary
  updatedAt: string
}

export type DashboardApiResponse = DashboardData | { error: string }
