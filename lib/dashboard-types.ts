export type KeyUsageRow = {
  environment_and_key: string
  total_requests: string
}

export type DashboardData = {
  totalRequests: string
  rows: KeyUsageRow[]
  updatedAt: string
}

export type DashboardApiResponse = DashboardData | { error: string }
