export type QueryName = "query_1" | "query_2"

export type KeyUsageRow = {
  environment_and_key: string
  total_requests: string | number
  first_used: string
  last_used: string
}

export type DashboardQuery = {
  name: QueryName
  sql: string
  rowCount: number
  rows: unknown[]
}

export type DashboardApiResponse =
  | {
      queries: DashboardQuery[]
    }
  | {
      error: string
    }

export type DashboardQueryMeta = {
  title: string
  subtitle?: string
}
