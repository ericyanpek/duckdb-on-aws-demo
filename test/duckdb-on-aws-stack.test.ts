import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { DuckDbOnAwsStack } from '../lib/duckdb-on-aws-stack.js';

function synthesize(): Template {
  const app = new cdk.App();
  const stack = new DuckDbOnAwsStack(app, 'TestFixture', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('DuckDB on AWS infrastructure', () => {
  it('keeps the DuckLake catalog private and encrypted', () => {
    const template = synthesize();

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
      StorageEncrypted: true,
      MultiAZ: false,
      Engine: 'postgres',
    });
  });

  it('creates distinct S3 and S3 Tables storage paths', () => {
    const template = synthesize();

    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3Tables::TableBucket', {
      TableBucketName: 'duckdb-aws-demo-123456789012-us-east-1',
    });
    template.hasResourceProperties('AWS::S3Tables::Namespace', {
      Namespace: 'demo',
    });
    template.hasResourceProperties('AWS::S3Tables::Table', {
      Namespace: 'demo',
      OpenTableFormat: 'ICEBERG',
      TableName: 'events',
    });
  });

  it('exposes no inbound rule on the workbench security group', () => {
    const template = synthesize();

    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'No inbound access; use AWS Systems Manager Session Manager',
      SecurityGroupEgress: Match.anyValue(),
    });
    expect(
      Object.values(template.findResources('AWS::EC2::SecurityGroupIngress')).filter(
        (resource) =>
          (resource.Properties as { readonly Description?: string }).Description !==
          'PostgreSQL from DuckDB workbench',
      ),
    ).toHaveLength(0);
  });
});
