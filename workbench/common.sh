#!/usr/bin/env bash
set -euo pipefail

DEMO_DIR="${DEMO_DIR:-/opt/duckdb-demo}"
REGION="$(<"${DEMO_DIR}/region")"
DATA_BUCKET="$(<"${DEMO_DIR}/data-bucket")"
TABLE_BUCKET_ARN="$(<"${DEMO_DIR}/table-bucket-arn")"
CATALOG_HOST="$(<"${DEMO_DIR}/catalog-host")"
CATALOG_SECRET_ARN="$(<"${DEMO_DIR}/catalog-secret-arn")"

secret_json="$(
  aws secretsmanager get-secret-value \
    --secret-id "${CATALOG_SECRET_ARN}" \
    --region "${REGION}" \
    --query SecretString \
    --output text
)"

PGHOST="$(jq -r --arg fallback "${CATALOG_HOST}" '.host // $fallback' <<<"${secret_json}")"
PGPORT="$(jq -r '.port // 5432' <<<"${secret_json}")"
PGDATABASE="$(jq -r '.dbname // "ducklake"' <<<"${secret_json}")"
PGUSER="$(jq -r '.username' <<<"${secret_json}")"
PGPASSWORD="$(jq -r '.password' <<<"${secret_json}")"

export REGION DATA_BUCKET TABLE_BUCKET_ARN PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

wait_for_catalog() {
  local attempts=0
  until PGPASSWORD="${PGPASSWORD}" pg_isready \
    --host="${PGHOST}" \
    --port="${PGPORT}" \
    --dbname="${PGDATABASE}" \
    --username="${PGUSER}" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if ((attempts >= 60)); then
      echo "PostgreSQL catalog did not become ready within 5 minutes." >&2
      return 1
    fi
    sleep 5
  done
}

ducklake_metadata_path() {
  printf 'host=%s port=%s dbname=%s user=%s password=%s sslmode=require' \
    "${PGHOST}" "${PGPORT}" "${PGDATABASE}" "${PGUSER}" "${PGPASSWORD}"
}
