export type WebhookUsageRow = {
  environment_and_key: string
  webhook_deliveries: string
  first_used: string | null
  last_used: string | null
}

export type DashboardData = {
  total: WebhookUsageRow
  rows: WebhookUsageRow[]
  updatedAt: string
}

export type DashboardApiResponse = DashboardData | { error: string }
