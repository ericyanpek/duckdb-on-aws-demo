#!/usr/bin/env bash
set -euo pipefail

scripts/remote-command.sh "sudo /opt/duckdb-demo/stop-quack.sh" || true
npx cdk destroy DuckDbOnAwsDemo --force
