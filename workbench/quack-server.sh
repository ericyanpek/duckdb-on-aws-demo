#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /opt/duckdb-demo/common.sh
metadata_path="$(ducklake_metadata_path)"
token="$(</opt/duckdb-demo/quack-token)"
sql_file="$(mktemp /tmp/quack-server.XXXXXX.sql)"
chmod 0600 "${sql_file}"

cat >"${sql_file}" <<SQL
INSTALL aws;
INSTALL httpfs;
INSTALL iceberg;
INSTALL postgres;
INSTALL ducklake;
INSTALL quack;
LOAD aws;
LOAD httpfs;
LOAD iceberg;
LOAD postgres;
LOAD ducklake;
LOAD quack;

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
    DATA_PATH 's3://${DATA_BUCKET}/ducklake/'
);
CALL quack_identify(
    name => 'duckdb-on-aws',
    provider => 'AWS',
    hostname => 'ssm-private-workbench',
    region => '${REGION}'
);
CALL quack_serve('quack:localhost', token := '${token}');
SQL

trap 'rm -f "${sql_file}"' EXIT
{ cat "${sql_file}"; tail -f /dev/null; } | duckdb /opt/duckdb-demo/quack-host.duckdb
