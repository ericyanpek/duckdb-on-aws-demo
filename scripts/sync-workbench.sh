#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
bucket="$(scripts/stack-output.sh DataBucketName)"

aws s3 sync workbench/ "s3://${bucket}/admin/workbench/" \
  --region "${region}" \
  --delete

scripts/remote-command.sh \
  "sudo aws s3 sync s3://${bucket}/admin/workbench/ /opt/duckdb-demo/ --region ${region} && sudo chmod 0755 /opt/duckdb-demo/*.sh"
