#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { DuckDbOnAwsStack } from '../lib/duckdb-on-aws-stack.js';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_REGION ?? 'us-east-1';

if (account === undefined) {
  throw new Error(
    'CDK_DEFAULT_ACCOUNT is required. Run through npx cdk with valid AWS credentials.',
  );
}

new DuckDbOnAwsStack(app, 'DuckDbOnAwsDemo', {
  env: { account, region },
  description: 'DuckDB, DuckLake, S3 Tables, and Quack reference demo on AWS',
});

cdk.Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
