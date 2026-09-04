export const AUTH_USER = "admin"
export const AUTH_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com"
export const AUTH_PASSWORD = process.env.ADMIN_PASSWORD ?? "h7R9mP2kL4vQ"
export const AUTH_SESSION_COOKIE_NAME = "db_logs_admin_session"
export const AUTH_SESSION_COOKIE_VALUE =
  process.env.ADMIN_SESSION_TOKEN ?? "db-logs-admin-session-token"
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export function isSessionValid(value: string | undefined | null): boolean {
  return value === AUTH_SESSION_COOKIE_VALUE
}
