#!/usr/bin/env bash
set -euo pipefail

key="${1:?CloudFormation output key is required}"
region="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

aws cloudformation describe-stacks \
  --stack-name DuckDbOnAwsDemo \
  --region "${region}" \
  --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue | [0]" \
  --output text
