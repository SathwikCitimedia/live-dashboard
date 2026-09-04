#!/usr/bin/env bash
set -euo pipefail

: "${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
: "${GCP_REGION:=us-central1}"
: "${SERVICE_NAME:=ai-interview-dashboard}"
: "${IMAGE_NAME:=${SERVICE_NAME}}"
: "${AR_REPO:=us-central1}"

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
  --set-env-vars="NODE_ENV=production" \
  --set-env-vars="DB_HOST=$DB_HOST,DB_PORT=$DB_PORT,DB_NAME=$DB_NAME,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,ADMIN_EMAIL=$ADMIN_EMAIL,ADMIN_PASSWORD=$ADMIN_PASSWORD,DB_QUERY_1=$DB_QUERY_1,DB_QUERY_2=$DB_QUERY_2" \
  --vpc-connector="${VPC_CONNECTOR:?Set VPC_CONNECTOR}" \
  --vpc-egress=all
