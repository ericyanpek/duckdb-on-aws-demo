#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
instance_id="$(scripts/stack-output.sh WorkbenchInstanceId)"

exec aws ssm start-session --target "${instance_id}" --region "${region}"
