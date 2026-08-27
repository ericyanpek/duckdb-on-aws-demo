#!/usr/bin/env bash
set -euo pipefail

token_file="/opt/duckdb-demo/quack-token"
pid_file="/opt/duckdb-demo/quack.pid"
log_file="/opt/duckdb-demo/quack.log"

if [[ -f "${pid_file}" ]] && kill -0 "$(<"${pid_file}")" 2>/dev/null; then
  echo "Quack is already running."
  exit 0
fi

openssl rand -hex 24 >"${token_file}"
chmod 0600 "${token_file}"

setsid /opt/duckdb-demo/quack-server.sh >"${log_file}" 2>&1 &
quack_pid=$!
echo "${quack_pid}" >"${pid_file}"

for _ in {1..60}; do
  if grep -q 'quack:localhost' "${log_file}" 2>/dev/null; then
    echo "Quack is listening on the workbench loopback interface."
    exit 0
  fi
  if ! kill -0 "${quack_pid}" 2>/dev/null; then
    cat "${log_file}" >&2
    exit 1
  fi
  sleep 2
done

echo "Quack did not become ready." >&2
cat "${log_file}" >&2
exit 1
