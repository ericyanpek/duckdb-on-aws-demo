#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /opt/duckdb-demo/common.sh
wait_for_catalog

metadata_path="$(ducklake_metadata_path)"

duckdb /opt/duckdb-demo/demo.duckdb <<SQL
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

COPY (
    SELECT
        i::BIGINT AS event_id,
        TIMESTAMP '2026-08-01 00:00:00' + i * INTERVAL 1 MINUTE AS event_time,
        ['NA', 'EU', 'APAC'][(i % 3) + 1] AS region,
        round(10 + (i % 500) * 0.37, 2)::DOUBLE AS revenue
    FROM range(1, 100001) AS t(i)
) TO 's3://${DATA_BUCKET}/raw/events/events.parquet'
  (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 10000);

ATTACH '${TABLE_BUCKET_ARN}' AS ice (
    TYPE ICEBERG,
    ENDPOINT_TYPE 'S3_Tables'
);
DELETE FROM ice.demo.events;
INSERT INTO ice.demo.events
SELECT * FROM read_parquet('s3://${DATA_BUCKET}/raw/events/events.parquet');

ATTACH 'ducklake:postgres:${metadata_path}' AS lake (
    DATA_PATH 's3://${DATA_BUCKET}/ducklake/'
);
CREATE TABLE IF NOT EXISTS lake.main.events (
    event_id BIGINT,
    event_time TIMESTAMP,
    region VARCHAR,
    revenue DOUBLE
);
DELETE FROM lake.main.events;
INSERT INTO lake.main.events
SELECT * FROM read_parquet('s3://${DATA_BUCKET}/raw/events/events.parquet');

SELECT 's3_parquet' AS source, count(*) AS rows, round(sum(revenue), 2) AS revenue
FROM read_parquet('s3://${DATA_BUCKET}/raw/events/events.parquet')
UNION ALL
SELECT 's3_tables', count(*), round(sum(revenue), 2) FROM ice.demo.events
UNION ALL
SELECT 'ducklake', count(*), round(sum(revenue), 2) FROM lake.main.events
ORDER BY source;

FROM lake.current_snapshot();
SQL
