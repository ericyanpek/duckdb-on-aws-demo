# 操作手册

## 前置条件

- Node.js 20 或更高版本
- AWS CLI v2
- Session Manager plugin
- `jq`、`curl`、`unzip` 和 `shellcheck`
- 有权部署 CDK、VPC、EC2、RDS、S3、S3 Tables、IAM 和 Secrets Manager 的 AWS 身份
- 目标账号与 Region 已完成 CDK bootstrap

确认身份：

```bash
aws sts get-caller-identity
aws configure get region
```

脚本默认使用 `AWS_REGION`、`AWS_DEFAULT_REGION`，两者都没有设置时使用 `us-east-1`。`cdk.context.json` 会包含账号相关的 Availability Zone 查询结果，仓库已将该文件忽略；`cdk.context.example.json` 只供无凭证 CI 合成模板。

## 安装与验证

```bash
npm ci
npm run build
npm run lint
npm test
npm run synth
npm run diff
```

## 部署

```bash
npx cdk deploy DuckDbOnAwsDemo \
  --outputs-file cdk-outputs.json
```

部署会创建持续计费资源，并显示 IAM 变更确认。只在非生产账号中继续。

查询栈输出：

```bash
aws cloudformation describe-stacks \
  --stack-name DuckDbOnAwsDemo \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

## 准备数据

```bash
npm run demo:prepare
```

该命令执行以下动作：

1. 生成 10 万行事件数据并写入 S3 Parquet。
2. 将数据写入 S3 Tables 的 `demo.events` Iceberg 表。
3. 初始化 DuckLake，并把数据写入 S3。
4. 输出三条路径的行数和收入聚合。

独立复验：

```bash
npm run demo:verify
```

## 并发与时间旅行

```bash
npm run demo:concurrency
```

脚本启动两个独立 DuckDB 进程，每个写入 1,000 行，然后比较写入前后 snapshot。

再次执行 `demo:prepare` 会把业务表内容重置为基础 10 万行，但不会删除历史 DuckLake snapshot。

## Quack

启动远端 Quack：

```bash
npm run demo:quack:start
```

Terminal A 保持隧道：

```bash
scripts/quack-tunnel.sh
```

Terminal B 查询：

```bash
npm run demo:quack:client
```

本地 DuckDB 1.5.3 会下载到 `.tools/`。Extension 也保存在 `.tools/home`，不会修改用户的 `~/.duckdb`。

Demo token 保存在工作台的 `/opt/duckdb-demo/quack-token`，权限为 `0600`。本地客户端通过 SSM Run Command 读取 token；有权查看 SSM command invocation 的主体可能在命令历史中看到它。不要把这个取舍用于生产环境。

停止 Quack：

```bash
npm run demo:quack:stop
```

## 更新工作台脚本

修改 `workbench/` 后无需替换 EC2：

```bash
npm run demo:sync
```

该命令把脚本同步到 Demo S3 bucket 的 `admin/workbench/`，再由 EC2 instance role 拉取。

## 进入工作台

```bash
scripts/connect-workbench.sh
```

常用诊断：

```bash
sudo cloud-init status --long
duckdb -version
sudo tail -200 /var/log/cloud-init-output.log
sudo tail -200 /opt/duckdb-demo/quack.log
```

## 清理

```bash
scripts/destroy.sh
```

清理后确认：

```bash
aws cloudformation describe-stacks \
  --stack-name DuckDbOnAwsDemo \
  --region us-east-1
```

预期返回 stack not found。

`scripts/destroy.sh` 会先尝试停止 Quack，再销毁 CloudFormation 栈。数据 bucket 和 DuckLake 数据按 `RemovalPolicy.DESTROY` 删除，不要把真实业务数据放进这个环境。

## 常见故障

### SSM 不在线

确认实例状态、public IPv4、出站 443、instance profile 和 `AmazonSSMManagedInstanceCore`。

### S3 403

每个新 DuckDB 进程都必须创建 AWS credential chain secret。DuckDB secret 是 connection-local，不会自动从另一个进程继承。

### Quack 本地 extension 安装失败

使用 `scripts/quack-client.sh`，它把 `HOME` 指向 `.tools/home`。不要使用低于 1.5.3 的 DuckDB 客户端。

### RDS 无法连接

确认命令在工作台执行。RDS 是私网 endpoint，本地机器不能直接连接。
