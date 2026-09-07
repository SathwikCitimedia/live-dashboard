import { Pool } from "pg"

declare global {
  var _pgPool: Pool | undefined
}

const getPool = (): Pool => {
  if (globalThis._pgPool) {
    return globalThis._pgPool
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    max: process.env.NODE_ENV === "production" ? 10 : 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })

  if (process.env.NODE_ENV !== "production") {
    globalThis._pgPool = pool
  }

  return pool
}

const pool = getPool()

export default pool
