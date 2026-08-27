#!/usr/bin/env bash
set -euo pipefail

duckdb_bin="$(scripts/install-local-duckdb.sh)"
token="$(scripts/remote-command.sh "sudo cat /opt/duckdb-demo/quack-token" | tr -d '[:space:]')"
mkdir -p .tools/home

HOME="${PWD}/.tools/home" "${duckdb_bin}" <<SQL
INSTALL quack;
LOAD quack;

FROM quack_query(
    'quack:localhost',
    \$query\$
    SELECT 'ducklake' AS source, count(*) AS rows, round(sum(revenue), 2) AS revenue
    FROM lake.main.events
    UNION ALL
    SELECT 's3_tables', count(*), round(sum(revenue), 2)
    FROM ice.demo.events
    ORDER BY source
    \$query\$,
    token = '${token}'
);
SQL
