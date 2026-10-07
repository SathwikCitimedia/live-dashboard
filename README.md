# AM webhook consumption dashboard

The dashboard summary and interview table both use the AM database's
`webhook_logs_AM` records. API consumption counts every raw webhook log row,
including failures and repeated log rows, and the summary shows the number of
distinct interviews plus the first and last recorded webhook times.

## Local configuration

Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, and optionally `ADMIN_SESSION_TOKEN` in the root `.env` file.
The `.env` and `.env.example` files are ignored by Git. Next.js loads multiline
quoted values from `.env`; the summary requires only `DB_QUERY_1`:

```dotenv
DB_QUERY_1="SELECT
    COUNT(*) AS api_consumption_all,
    COUNT(DISTINCT interview_id) AS distinct_interviews,
    MIN(created_at) AS first_used,
    MAX(created_at) AS last_used
FROM webhook_logs_AM;"
```

Install dependencies with `npm install`, then run `npm run dev`. The query runs
once per summary refresh in a read-only transaction. It counts logs directly,
without filtering on success, environment, or API key and without joining to API
usage records. No second summary query is required.

The interview table shows one row for each AM interview referenced by the raw
logs, with that interview's log count as API consumption. Its global consumption
count covers every page, rather than only the visible interviews, so it matches
the summary's source and counting rules. Both dashboard APIs return an error when
a log has a null interview ID or references a missing AM interview; correct those
source records before loading the dashboard instead of silently dropping
consumption.

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
