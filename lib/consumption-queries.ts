import type { PoolClient } from "pg"

import type { UsageSummary } from "@/lib/dashboard-types"
import type { InterviewRow } from "@/lib/interview-types"

const isCount = (value: unknown): value is string => typeof value === "string" && /^\d+$/.test(value)
const isTimestampText = (value: unknown) => value === null || typeof value === "string"

const WEBHOOK_USAGE = `
  WITH webhook_usage AS (
    SELECT interview_id, COUNT(*) AS api_consumption,
      MIN(created_at) AS first_used, MAX(created_at) AS last_used
    FROM public.webhook_logs_am
    GROUP BY interview_id
  )
`

export function getUsageSummarySql() {
  const sql = process.env.DB_QUERY_1?.trim().replace(/;+\s*$/, "")
  if (!sql) throw new Error("Usage query is not configured")
  return sql
}

export async function loadUsageSummary(client: PoolClient, sql: string): Promise<UsageSummary> {
  const result = await client.query<UsageSummary>(`
    SELECT api_consumption_all::text AS api_consumption_all,
      distinct_interviews::text AS distinct_interviews,
      first_used::text AS first_used, last_used::text AS last_used
    FROM (${sql}) AS usage_summary
  `)
  if (result.rows.length !== 1) throw new Error("Usage query must return exactly one summary")
  const summary = result.rows[0]
  if (!isCount(summary.api_consumption_all) || !isCount(summary.distinct_interviews) ||
      !isTimestampText(summary.first_used) || !isTimestampText(summary.last_used)) {
    throw new Error("Usage summary contains invalid values")
  }
  return summary
}

export async function assertUsageSummaryMatchesInterviews(client: PoolClient, summary: UsageSummary) {
  const result = await client.query<UsageSummary & { invalid_interviews: string }>(`
    ${WEBHOOK_USAGE}, interview_matches AS (
      SELECT usage.*,
        (SELECT COUNT(*) FROM public.interviews_am AS i
          WHERE i.interview_id = usage.interview_id) AS matching_interviews
      FROM webhook_usage AS usage
    )
    SELECT COALESCE(SUM(api_consumption), 0)::text AS api_consumption_all,
      COUNT(interview_id)::text AS distinct_interviews,
      MIN(first_used)::text AS first_used, MAX(last_used)::text AS last_used,
      COUNT(*) FILTER (WHERE interview_id IS NULL OR matching_interviews <> 1)::text AS invalid_interviews
    FROM interview_matches AS reconciliation
  `)
  if (result.rows.length !== 1) throw new Error("Usage reconciliation must return one row")
  const actual = result.rows[0]
  if (!isCount(actual.api_consumption_all) || !isCount(actual.distinct_interviews) ||
      !isCount(actual.invalid_interviews) || BigInt(actual.invalid_interviews) !== BigInt(0) ||
      BigInt(actual.api_consumption_all) !== BigInt(summary.api_consumption_all) ||
      BigInt(actual.distinct_interviews) !== BigInt(summary.distinct_interviews) ||
      actual.first_used !== summary.first_used || actual.last_used !== summary.last_used) {
    throw new Error("Usage summary does not match the available AM interviews")
  }
}

export async function loadInterviewPage(client: PoolClient, pageSize: number, offset: number) {
  const result = await client.query<InterviewRow>(`
    ${WEBHOOK_USAGE}
    SELECT i.id, i.interview_id, i.candidate_name, i.candidate_email,
      i.role, i.status, i.session_id,
      usage.api_consumption::text AS api_consumption,
      usage.first_used::text AS first_used, usage.last_used::text AS last_used
    FROM public.interviews_am AS i
    JOIN webhook_usage AS usage ON usage.interview_id = i.interview_id
    ORDER BY usage.last_used DESC NULLS LAST, i.id DESC
    LIMIT $1 OFFSET $2
  `, [pageSize, offset])
  if (result.rows.some((row) => !isCount(row.api_consumption) || BigInt(row.api_consumption) < BigInt(1) ||
      typeof row.interview_id !== "string" || !isTimestampText(row.first_used) || !isTimestampText(row.last_used))) {
    throw new Error("Interview usage contains invalid values")
  }
  return result.rows
}
