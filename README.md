# Successful webhook delivery dashboard

The dashboard counts successful webhook deliveries and shows the first and last
delivery times for each environment and all three API keys together.

## Local configuration

Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and optionally `ADMIN_SESSION_TOKEN` in the root `.env` file.
The `.env` and `.env.example` files are ignored by Git. Next.js loads multiline
quoted values from `.env`; the summary requires only `DB_QUERY_1`:

```dotenv
DB_QUERY_1="SELECT
    CASE
        WHEN a.api_key_prefix = 'ds-9f3a7c2' THEN 'Production (original key)'
        WHEN a.api_key_prefix = 'ds-097b27f' THEN 'Production (new key)'
        WHEN a.api_key_prefix = 'ds-2671acc' THEN 'Dev/Staging (new key)'
        ELSE 'TOTAL (all keys)'
    END AS environment_and_key,
    COUNT(*) AS webhook_deliveries,
    MIN(w.created_at) AS first_used,
    MAX(w.created_at) AS last_used
FROM webhook_logs_AM w
JOIN api_usage_AM a ON a.interview_id = w.interview_id
WHERE w.success = TRUE
  AND a.api_key_prefix IN ('ds-9f3a7c2', 'ds-097b27f', 'ds-2671acc')
GROUP BY ROLLUP (a.api_key_prefix)
ORDER BY webhook_deliveries DESC;"
```

Install dependencies with `npm install`, then run `npm run dev`. The query runs
once per summary refresh in a read-only transaction. Its `COUNT(*)` counts the
joined rows, so multiple matching API usage records can contribute multiple
deliveries. No second summary query is required.

## Cloud Run deployment

Export the database, admin, and `DB_QUERY_1` settings into the shell before
running `bash CloudRun.Deploy.sh`. Also set `GCP_PROJECT_ID` and `VPC_CONNECTOR`.
Optional deployment settings are `GCP_REGION`, `SERVICE_NAME`, `IMAGE_NAME`,
`IMAGE_TAG`, and `AR_REPO`.

The deploy script sends one complete environment-variable argument containing
`NODE_ENV=production` and the application settings. It preserves an exported
`ADMIN_SESSION_TOKEN` and uses Cloud Run's
[alternate delimiter syntax](https://docs.cloud.google.com/run/docs/configuring/services/environment-variables#escape-comma-characters)
to keep SQL commas and newlines intact. If any value contains the delimiter
`__LIVE_DASHBOARD_ENV__`, the script stops with the setting's name before
running Docker or gcloud; change that delimiter in the script before retrying.

Run API and deployment checks with `node --test tests/*.test.mjs` and the
TypeScript check with `npm run typecheck`.

## UI components

This is a Next.js application with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
