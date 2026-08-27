#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /opt/duckdb-demo/common.sh
metadata_path="$(ducklake_metadata_path)"

current_snapshot() {
  duckdb -csv -noheader <<SQL
INSTALL postgres;
INSTALL ducklake;
LOAD postgres;
LOAD ducklake;
ATTACH 'ducklake:postgres:${metadata_path}' AS lake (
    DATA_PATH 's3://${DATA_BUCKET}/ducklake/'
);
SELECT id FROM lake.current_snapshot();
SQL
}

before_snapshot="$(current_snapshot)"

/opt/duckdb-demo/append-ducklake.sh 1 1000 > /tmp/writer-1.log 2>&1 &
writer_one_pid=$!
/opt/duckdb-demo/append-ducklake.sh 2 1000 > /tmp/writer-2.log 2>&1 &
writer_two_pid=$!

wait "${writer_one_pid}"
wait "${writer_two_pid}"

after_snapshot="$(current_snapshot)"

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

SELECT
    ${before_snapshot} AS before_snapshot,
    ${after_snapshot} AS after_snapshot,
    (SELECT count(*) FROM lake.main.events AT (VERSION => ${before_snapshot})) AS rows_before,
    (SELECT count(*) FROM lake.main.events) AS rows_after;

SELECT region, count(*) AS rows
FROM lake.main.events
WHERE region LIKE 'writer-%'
GROUP BY region
ORDER BY region;
SQL
