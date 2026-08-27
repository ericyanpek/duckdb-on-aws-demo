#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /opt/duckdb-demo/common.sh
metadata_path="$(ducklake_metadata_path)"

duckdb -readonly /opt/duckdb-demo/demo.duckdb <<SQL
INSTALL aws;
INSTALL httpfs;
INSTALL iceberg;
INSTALL postgres;
INSTALL ducklake;
LOAD aws;
LOAD httpfs;
LOAD iceberg;
LOAD postgres;
LOAD ducklake;

CREATE OR REPLACE SECRET demo_s3 (
    TYPE s3,
    PROVIDER credential_chain,
    REGION '${REGION}'
);
ATTACH '${TABLE_BUCKET_ARN}' AS ice (
    TYPE ICEBERG,
    ENDPOINT_TYPE 'S3_Tables'
);
ATTACH 'ducklake:postgres:${metadata_path}' AS lake (
    DATA_PATH 's3://${DATA_BUCKET}/ducklake/',
    READ_ONLY
);

SELECT 's3_parquet' AS source, count(*) AS rows, round(sum(revenue), 2) AS revenue
FROM read_parquet('s3://${DATA_BUCKET}/raw/events/events.parquet')
UNION ALL
SELECT 's3_tables', count(*), round(sum(revenue), 2) FROM ice.demo.events
UNION ALL
SELECT 'ducklake', count(*), round(sum(revenue), 2) FROM lake.main.events
ORDER BY source;

SELECT snapshot_id, snapshot_time, changes
FROM lake.snapshots()
ORDER BY snapshot_id DESC
LIMIT 8;
SQL
