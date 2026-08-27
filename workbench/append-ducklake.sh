#!/usr/bin/env bash
set -euo pipefail

writer="${1:?writer number is required}"
rows="${2:-1000}"

# shellcheck source=/dev/null
source /opt/duckdb-demo/common.sh
metadata_path="$(ducklake_metadata_path)"
start_id=$((100000 + writer * 1000000))

duckdb <<SQL
INSTALL aws;
INSTALL httpfs;
INSTALL postgres;
INSTALL ducklake;
LOAD aws;
LOAD httpfs;
LOAD postgres;
LOAD ducklake;

CREATE OR REPLACE SECRET demo_s3 (
    TYPE s3,
    PROVIDER credential_chain,
    REGION '${REGION}'
);
ATTACH 'ducklake:postgres:${metadata_path}' AS lake (
    DATA_PATH 's3://${DATA_BUCKET}/ducklake/'
);

INSERT INTO lake.main.events
SELECT
    (${start_id} + i)::BIGINT,
    current_timestamp + i * INTERVAL 1 SECOND,
    'writer-${writer}',
    (${writer} * 100 + i * 0.01)::DOUBLE
FROM range(${rows}) AS t(i);

FROM lake.current_snapshot();
SQL
