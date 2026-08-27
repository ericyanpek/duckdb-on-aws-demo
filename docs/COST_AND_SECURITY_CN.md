# 成本与安全边界

## 持续计费资源

| 资源 | 主要计费维度 | 本 Demo 的控制 |
|---|---|---|
| EC2 `t3.small` | 实例时长、16 GiB gp3 EBS、public IPv4 | 单实例，无 Load Balancer，无 NAT Gateway |
| RDS `db.t4g.micro` | 实例时长、20 GiB gp3、备份存储 | Single-AZ，1 天备份，销毁时删除自动备份 |
| S3 | 存储、PUT/GET/LIST、数据传输 | 约 10 万行小型数据集，1 天清理未完成 multipart upload |
| S3 Tables | 表存储、对象监控、API、自动维护 | 单 bucket、单 namespace、单表 |
| Secrets Manager | secret 存储与 API | 单个 RDS secret |

CloudFormation、CDK、IAM、VPC、Security Group 本身不按资源小时计费。Systems Manager Session Manager 对本场景通常没有单独会话费用，但相关日志或高级功能可能产生费用。

价格会随 Region 和时间变化，本项目不固化美元估算。演示前后应参考：

- [Amazon EC2 Pricing](https://aws.amazon.com/ec2/pricing/)
- [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [Amazon S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [AWS Secrets Manager Pricing](https://aws.amazon.com/secrets-manager/pricing/)

## 安全控制

- S3 Block Public Access 全开。
- S3 使用 SSE-S3，并拒绝非 TLS 请求。
- RDS storage encryption 开启，且只部署在 isolated subnet。
- RDS 5432 只允许工作台 security group。
- EC2 root EBS encryption 开启。
- EC2 无任何 inbound security group rule。
- 运维访问只通过 SSM。
- Quack 只监听 `localhost:9494`。
- Quack token 每次启动随机生成，文件权限为 `0600`。
- RDS 密码由 Secrets Manager 生成，不进入 Git、UserData 或 CloudFormation output。
- 工作台 IAM 权限限定到 Demo bucket、单个 S3 Tables bucket/table、单个 secret 和固定 CDK asset。

## 有意接受的 Demo 风险

| 取舍 | 原因 | 生产建议 |
|---|---|---|
| RDS Single-AZ | 降低演示成本 | Multi-AZ 或 Aurora PostgreSQL |
| RDS deletion protection 关闭 | 支持一键清理 | 生产环境开启并使用保留策略 |
| Secret 不自动轮换 | 避免增加 VPC rotation Lambda | 配置 rotation、审计和最小数据库角色 |
| VPC Flow Logs 关闭 | 避免持续日志成本 | 写入 CloudWatch Logs 或 S3 并设 retention |
| S3 access logging 关闭 | Demo 只含生成数据 | 启用 CloudTrail data events 或 access logs |
| EC2 detailed monitoring 关闭 | 降低成本 | 按 SLO 配置监控、告警和日志 |
| Quack beta | 展示未来交互形态 | 不作为未验证的生产服务入口 |
| Quack token 通过 SSM Run Command 交给本地客户端 | 避免开放网络入口或维护额外 secret | 使用正式身份系统、短期凭证，并限制 SSM command history 的读取权限 |
| DuckDB CLI 从固定 GitHub Release URL 下载但未校验 digest | 保持 Demo 安装流程简短 | 固定并校验 SHA-256、使用受控制品库，并管理 extension 允许列表 |

## 停止计费

资源会持续计费，直到执行：

```bash
scripts/destroy.sh
```

S3 Tables 表由 CloudFormation 管理，因此销毁时可以先删表，再删 namespace 和 table bucket。不要在栈外向该 table bucket 创建未纳管表，否则可能阻止 table bucket 删除。

这个栈对 S3、RDS 和 EBS 使用销毁策略。它只适合生成数据，不应承载需要保留的业务数据。
