export type KeyUsageRow = {
  environment_and_key: string
  total_requests: string
  first_used: string | null
  last_used: string | null
}

export type DashboardData = {
  totalRequests: string
  rows: KeyUsageRow[]
  pagination: { page: number; pageSize: number; totalRows: number; totalPages: number }
  updatedAt: string
}

export type DashboardApiResponse = DashboardData | { error: string }
