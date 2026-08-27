import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3tables from 'aws-cdk-lib/aws-s3tables';
import { Construct } from 'constructs';

export class DuckDbOnAwsStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const dataBucket = new s3.Bucket(this, 'DataBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          id: 'AbortIncompleteMultipartUploads',
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const workbenchDeployment = new s3deploy.BucketDeployment(this, 'WorkbenchScripts', {
      destinationBucket: dataBucket,
      destinationKeyPrefix: 'admin/workbench',
      prune: true,
      sources: [s3deploy.Source.asset(new URL('../workbench', import.meta.url).pathname)],
    });
    const bucketDeploymentProvider = this.node.children.find((child) =>
      child.node.id.startsWith('Custom::CDKBucketDeployment'),
    );
    const providerRole = bucketDeploymentProvider?.node.tryFindChild('ServiceRole');
    const providerPolicy = providerRole?.node.tryFindChild('DefaultPolicy');
    const providerFunction = bucketDeploymentProvider?.node.tryFindChild('Resource');
    const providerRoleResource = providerRole?.node.defaultChild;
    const providerPolicyResource = providerPolicy?.node.defaultChild;
    if (
      providerRoleResource === undefined ||
      providerPolicyResource === undefined ||
      providerFunction === undefined
    ) {
      throw new Error('The CDK bucket deployment provider resources must exist.');
    }
    providerRoleResource.node.addMetadata(cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]':
        'This CDK-generated singleton provider uses the AWS Lambda basic logging policy.',
    });
    providerPolicyResource.node.addMetadata(cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      'AwsSolutions-IAM5[Action::s3:GetBucket*]':
        'The CDK-generated provider needs bucket metadata while staging the workbench archive.',
      'AwsSolutions-IAM5[Action::s3:GetObject*]':
        'The CDK-generated provider reads the content-addressed workbench archive from the bootstrap bucket.',
      'AwsSolutions-IAM5[Action::s3:List*]':
        'The CDK-generated provider lists only its source and destination buckets during synchronization.',
      [`AwsSolutions-IAM5[Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*]`]:
        'The CDK bootstrap asset key is content-addressed at deployment time; the provider needs object access in that one bucket.',
      'AwsSolutions-IAM5[Action::s3:Abort*]':
        'The CDK-generated provider must abort failed multipart uploads to the destination prefix.',
      'AwsSolutions-IAM5[Action::s3:DeleteObject*]':
        'Pruning obsolete workbench files requires delete access in the fixed destination prefix.',
    });
    cdk.Validations.of(providerFunction).acknowledge({
      id: 'AwsSolutions::AwsSolutions-L1',
      reason:
        'The Lambda runtime is selected by the pinned aws-cdk-lib BucketDeployment provider and is not configurable here.',
    });
    cdk.Validations.of(dataBucket).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'This short-lived demo bucket contains generated benchmark data only. ' +
        'Server access logging is omitted to avoid a second persistent bucket and recursive log management.',
    });

    const tableBucketName = `duckdb-aws-demo-${this.account}-${this.region}`;
    const tableBucket = new s3tables.CfnTableBucket(this, 'TableBucket', {
      tableBucketName,
    });

    const tableNamespace = new s3tables.CfnNamespace(this, 'TableNamespace', {
      namespace: 'demo',
      tableBucketArn: tableBucket.attrTableBucketArn,
    });

    const eventTable = new s3tables.CfnTable(this, 'EventTable', {
      icebergMetadata: {
        icebergSchema: {
          schemaFieldList: [
            { id: 1, name: 'event_id', required: true, type: 'long' },
            { id: 2, name: 'event_time', required: true, type: 'timestamp' },
            { id: 3, name: 'region', required: true, type: 'string' },
            { id: 4, name: 'revenue', required: true, type: 'double' },
          ],
        },
        tableProperties: {
          'format-version': '2',
          'write.parquet.compression-codec': 'zstd',
        },
      },
      namespace: 'demo',
      openTableFormat: 'ICEBERG',
      tableBucketArn: tableBucket.attrTableBucketArn,
      tableName: 'events',
    });

    const vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Workbench',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Catalog',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });
    cdk.Validations.of(vpc).acknowledge({
      id: 'AwsSolutions-VPC7',
      reason:
        'VPC Flow Logs are intentionally omitted for the short-lived demo to avoid ongoing CloudWatch Logs cost. ' +
        'The workbench has no inbound rules and the database accepts traffic only from its security group.',
    });

    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PUBLIC }],
    });

    const workbenchSecurityGroup = new ec2.SecurityGroup(this, 'WorkbenchSecurityGroup', {
      allowAllOutbound: true,
      description: 'No inbound access; use AWS Systems Manager Session Manager',
      vpc,
    });

    const catalogSecurityGroup = new ec2.SecurityGroup(this, 'CatalogSecurityGroup', {
      allowAllOutbound: false,
      description: 'DuckLake PostgreSQL catalog access from the workbench only',
      vpc,
    });
    catalogSecurityGroup.addIngressRule(
      workbenchSecurityGroup,
      ec2.Port.tcp(5432),
      'PostgreSQL from DuckDB workbench',
    );

    const catalog = new rds.DatabaseInstance(this, 'Catalog', {
      allocatedStorage: 20,
      allowMajorVersionUpgrade: false,
      autoMinorVersionUpgrade: true,
      backupRetention: cdk.Duration.days(1),
      credentials: rds.Credentials.fromGeneratedSecret('ducklake_admin', {
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'/@"\\',
      }),
      databaseName: 'ducklake',
      deleteAutomatedBackups: true,
      deletionProtection: false,
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE4_GRAVITON,
        ec2.InstanceSize.MICRO,
      ),
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      securityGroups: [catalogSecurityGroup],
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    cdk.Validations.of(catalog).acknowledge({
      id: 'AwsSolutions-RDS3',
      reason:
        'Single-AZ is a deliberate cost choice for a reproducible, non-production demo catalog.',
    });
    cdk.Validations.of(catalog).acknowledge({
      id: 'AwsSolutions-RDS10',
      reason: 'Deletion protection is disabled so cdk destroy can fully clean up this demo.',
    });
    cdk.Validations.of(catalog).acknowledge({
      id: 'AwsSolutions-RDS11',
      reason:
        'PostgreSQL uses its standard port inside isolated subnets; its security group permits only the workbench security group.',
    });
    if (catalog.secret !== undefined) {
      const catalogSecretResource = catalog.secret.node.defaultChild;
      if (catalogSecretResource === undefined) {
        throw new Error('The generated RDS secret must have a CloudFormation resource.');
      }
      cdk.Validations.of(catalogSecretResource).acknowledge({
        id: 'AwsSolutions::AwsSolutions-SMG4',
        reason:
          'Automatic rotation is omitted for this short-lived demo because adding a VPC rotation function ' +
          'would materially increase complexity and cost.',
      });
    }

    const workbenchRole = new iam.Role(this, 'WorkbenchRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'Runtime role for the DuckDB and Quack demo workbench',
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore')],
    });
    workbenchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetBucketLocation', 's3:ListBucket', 's3:ListBucketMultipartUploads'],
        resources: [dataBucket.bucketArn],
      }),
    );
    workbenchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3:AbortMultipartUpload',
          's3:DeleteObject',
          's3:GetObject',
          's3:GetObjectVersion',
          's3:ListMultipartUploadParts',
          's3:PutObject',
        ],
        resources: [dataBucket.arnForObjects('*')],
      }),
    );
    catalog.secret?.grantRead(workbenchRole);

    const tableBucketArn = tableBucket.attrTableBucketArn;
    workbenchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3tables:GetNamespace',
          's3tables:ListNamespaces',
          's3tables:GetTableBucket',
          's3tables:ListTables',
        ],
        resources: [tableBucket.attrTableBucketArn],
      }),
    );
    workbenchRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          's3tables:GetTable',
          's3tables:GetTableMetadataLocation',
          's3tables:UpdateTableMetadataLocation',
          's3tables:GetTableData',
          's3tables:PutTableData',
        ],
        resources: [eventTable.attrTableArn],
      }),
    );
    const workbenchRoleResource = workbenchRole.node.defaultChild;
    const workbenchPolicyResource = workbenchRole.node.findChild('DefaultPolicy').node.defaultChild;
    if (workbenchRoleResource === undefined || workbenchPolicyResource === undefined) {
      throw new Error('The workbench role and default policy must have CloudFormation resources.');
    }
    // CDK's acknowledgment parser cannot encode cdk-nag finding IDs that themselves contain "::".
    workbenchRoleResource.node.addMetadata(cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/AmazonSSMManagedInstanceCore]':
        'AmazonSSMManagedInstanceCore is the AWS-maintained baseline required for Session Manager access; ' +
        'the workbench exposes no SSH ingress.',
    });
    workbenchPolicyResource.node.addMetadata(cdk.Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      'AwsSolutions-IAM5[Resource::<DataBucketE3889A50.Arn>/*]':
        'Object-level S3 permissions must target a key wildcard; the resource remains limited to the generated demo bucket.',
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf install -y jq postgresql16 unzip',
      'install -d -m 0755 /opt/duckdb-demo',
      `aws s3 sync s3://${dataBucket.bucketName}/admin/workbench/ /opt/duckdb-demo/ --region ${this.region}`,
      'chmod 0755 /opt/duckdb-demo/*.sh',
      'curl --fail --silent --show-error --location --retry 5 ' +
        'https://github.com/duckdb/duckdb/releases/download/v1.5.3/duckdb_cli-linux-amd64.zip ' +
        '--output /tmp/duckdb.zip',
      'unzip -o /tmp/duckdb.zip -d /usr/local/bin',
      'chmod 0755 /usr/local/bin/duckdb',
      `printf '%s\\n' '${this.region}' > /opt/duckdb-demo/region`,
      `printf '%s\\n' '${dataBucket.bucketName}' > /opt/duckdb-demo/data-bucket`,
      `printf '%s\\n' '${tableBucketArn}' > /opt/duckdb-demo/table-bucket-arn`,
      `printf '%s\\n' '${catalog.dbInstanceEndpointAddress}' > /opt/duckdb-demo/catalog-host`,
      `printf '%s\\n' '${catalog.secret?.secretArn ?? ''}' > /opt/duckdb-demo/catalog-secret-arn`,
      'touch /opt/duckdb-demo/READY',
    );

    const workbench = new ec2.Instance(this, 'Workbench', {
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(16, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role: workbenchRole,
      securityGroup: workbenchSecurityGroup,
      ssmSessionPermissions: true,
      userData,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    cdk.Validations.of(workbench).acknowledge({
      id: 'AwsSolutions-EC28',
      reason:
        'Detailed monitoring is omitted to reduce recurring cost for the short-lived demo workbench.',
    });
    cdk.Validations.of(workbench).acknowledge({
      id: 'AwsSolutions-EC29',
      reason: 'Termination protection is disabled so cdk destroy can fully clean up this demo.',
    });

    tableNamespace.addResourceDependency(tableBucket);
    eventTable.addResourceDependency(tableNamespace);
    workbench.node.addDependency(catalog);
    workbench.node.addDependency(eventTable);
    workbench.node.addDependency(workbenchDeployment);

    new cdk.CfnOutput(this, 'DataBucketName', {
      description: 'S3 general purpose bucket for Parquet and DuckLake data',
      value: dataBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'TableBucketArn', {
      description: 'S3 Tables bucket ARN for the Iceberg path',
      value: tableBucketArn,
    });
    new cdk.CfnOutput(this, 'TableNamespaceName', {
      value: 'demo',
    });
    new cdk.CfnOutput(this, 'EventTableArn', {
      value: eventTable.attrTableArn,
    });
    new cdk.CfnOutput(this, 'CatalogEndpoint', {
      description: 'Private RDS PostgreSQL endpoint used as the DuckLake catalog',
      value: catalog.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, 'CatalogSecretArn', {
      value: catalog.secret?.secretArn ?? 'unavailable',
    });
    new cdk.CfnOutput(this, 'WorkbenchInstanceId', {
      description: 'Use this instance ID with AWS Systems Manager Session Manager',
      value: workbench.instanceId,
    });
    new cdk.CfnOutput(this, 'QuackTunnelCommand', {
      description: 'Start this tunnel after Quack is running on the workbench',
      value:
        `aws ssm start-session --target ${workbench.instanceId} --region ${this.region} ` +
        "--document-name AWS-StartPortForwardingSession --parameters 'portNumber=9494,localPortNumber=9494'",
    });
  }
}
