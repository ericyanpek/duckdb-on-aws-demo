#!/usr/bin/env bash
set -euo pipefail

command="${1:?remote command is required}"
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
instance_id="$(scripts/stack-output.sh WorkbenchInstanceId)"
parameters="$(jq -cn --arg command "${command}" '{commands: [$command]}')"

command_id="$(
  aws ssm send-command \
    --region "${region}" \
    --instance-ids "${instance_id}" \
    --document-name AWS-RunShellScript \
    --parameters "${parameters}" \
    --query Command.CommandId \
    --output text
)"

set +e
aws ssm wait command-executed \
  --region "${region}" \
  --command-id "${command_id}" \
  --instance-id "${instance_id}"
wait_status=$?
set -e

status="$(
  aws ssm get-command-invocation \
    --region "${region}" \
    --command-id "${command_id}" \
    --instance-id "${instance_id}" \
    --query Status \
    --output text
)"

aws ssm get-command-invocation \
  --region "${region}" \
  --command-id "${command_id}" \
  --instance-id "${instance_id}" \
  --query StandardOutputContent \
  --output text

if [[ "${status}" != "Success" || "${wait_status}" -ne 0 ]]; then
  aws ssm get-command-invocation \
    --region "${region}" \
    --command-id "${command_id}" \
    --instance-id "${instance_id}" \
    --query StandardErrorContent \
    --output text >&2
  exit 1
fi
