#!/usr/bin/env bash
set -euo pipefail

version="${DUCKDB_VERSION:-1.5.3}"
tools_dir=".tools/duckdb-${version}"

if [[ -x "${tools_dir}/duckdb" ]]; then
  echo "${tools_dir}/duckdb"
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64 | Darwin-x86_64)
    asset="duckdb_cli-osx-universal.zip"
    ;;
  Linux-x86_64)
    asset="duckdb_cli-linux-amd64.zip"
    ;;
  Linux-aarch64 | Linux-arm64)
    asset="duckdb_cli-linux-arm64.zip"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p "${tools_dir}"
curl --fail --silent --show-error --location --retry 5 \
  "https://github.com/duckdb/duckdb/releases/download/v${version}/${asset}" \
  --output "${tools_dir}/duckdb.zip"
unzip -o "${tools_dir}/duckdb.zip" -d "${tools_dir}" >/dev/null
chmod 0755 "${tools_dir}/duckdb"
echo "${tools_dir}/duckdb"
