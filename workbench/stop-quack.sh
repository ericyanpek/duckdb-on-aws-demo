#!/usr/bin/env bash
set -euo pipefail

pid_file="/opt/duckdb-demo/quack.pid"

if [[ ! -f "${pid_file}" ]]; then
  echo "Quack is not running."
  exit 0
fi

quack_pid="$(<"${pid_file}")"
if kill -0 "${quack_pid}" 2>/dev/null; then
  kill -- "-${quack_pid}" 2>/dev/null || kill "${quack_pid}" 2>/dev/null || true
fi
rm -f "${pid_file}"
echo "Quack stopped."
