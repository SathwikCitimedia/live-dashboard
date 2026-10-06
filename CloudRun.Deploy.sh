#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:=us-central1}"
: "${SERVICE_NAME:=ai-interview-dashboard}"
: "${IMAGE_NAME:=${SERVICE_NAME}}"
: "${AR_REPO:=us-central1}"
: "${VPC_CONNECTOR:?Set VPC_CONNECTOR}"

# gcloud uses commas by default, which occur throughout DB_QUERY_1.
# Check every value before building or changing any Cloud configuration.
ENV_DELIMITER="__LIVE_DASHBOARD_ENV__"
ENV_KEYS=(DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD ADMIN_EMAIL ADMIN_PASSWORD DB_QUERY_1)
if [[ -n "${ADMIN_SESSION_TOKEN+x}" ]]; then
  ENV_KEYS+=(ADMIN_SESSION_TOKEN)
fi
ENV_VARS="^${ENV_DELIMITER}^NODE_ENV=production"
for ENV_KEY in "${ENV_KEYS[@]}"; do
  if [[ -z "${!ENV_KEY+x}" ]]; then
    printf 'Set %s\n' "${ENV_KEY}" >&2
    exit 1
  fi
  ENV_VALUE="${!ENV_KEY}"
  if [[ "${ENV_VALUE}" == *"${ENV_DELIMITER}"* ]]; then
    printf 'Environment delimiter collision in %s\n' "${ENV_KEY}" >&2
    exit 1
  fi
  ENV_VARS+="${ENV_DELIMITER}${ENV_KEY}=${ENV_VALUE}"
done

ARTIFACT_REPO="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/cloud-run-repo"
if [[ -d .git ]] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD)}"
else
  IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
fi
IMAGE_URI="${ARTIFACT_REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

gcloud config set project "${GCP_PROJECT_ID}"

gcloud auth configure-docker "${AR_REPO}-docker.pkg.dev"

docker buildx build --platform linux/amd64 -t "${IMAGE_URI}" .
docker push "${IMAGE_URI}"

gcloud run deploy "${SERVICE_NAME}" \
  --project="${GCP_PROJECT_ID}" \
  --region="${GCP_REGION}" \
  --image="${IMAGE_URI}" \
  --platform=managed \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=512Mi \
  --port=8080 \
  --set-env-vars="${ENV_VARS}" \
  --vpc-connector="${VPC_CONNECTOR}" \
  --vpc-egress=all
