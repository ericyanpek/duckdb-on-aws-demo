# DuckDB on AWS Demo

这个仓库把 DuckDB、DuckLake、Amazon S3 Tables 和 Quack 放进同一个可部署、可销毁的 Demo。它使用一份生成的事件数据，依次展示四条路径：

| 路径 | 展示内容 |
|---|---|
| DuckDB + Amazon S3 | 直接读写 S3 上的 Parquet |
| DuckDB + Amazon S3 Tables | 通过 Iceberg REST Catalog 读写托管 Iceberg 表 |
| DuckLake + Amazon RDS for PostgreSQL + Amazon S3 | PostgreSQL 保存 catalog，S3 保存 Parquet，两个 DuckDB writer 共享提交与快照 |
| Quack + AWS Systems Manager | 将准备好的远端 DuckDB 会话提供给本地 DuckDB 客户端，不开放公网入站端口 |

Demo 默认部署到 `us-east-1`，CloudFormation 栈名为 `DuckDbOnAwsDemo`。DuckDB 固定在 `v1.5.3`，因为 Quack 的 beta 版本从该版本开始作为 core extension 提供；两份调研文档使用更新的 `v1.5.5` 作为产品基线。

## 架构

EC2 工作台运行 DuckDB 和 Quack，S3 保存 Parquet 与 DuckLake 数据文件，S3 Tables 提供托管 Iceberg，RDS for PostgreSQL 保存 DuckLake catalog。Quack 只监听 EC2 loopback，本地访问经过 Systems Manager 端口转发。

完整资源关系和权限边界见[架构设计](docs/ARCHITECTURE_CN.md)。

## 运行 Demo

开始前请阅读[操作手册](docs/RUNBOOK_CN.md)和[成本与安全边界](docs/COST_AND_SECURITY_CN.md)。该栈会创建持续计费资源，建议只部署到非生产账号，并在演示后立即销毁。

```bash
npm ci
npm run build
npm run lint
npm test
npm run synth
npm run diff

npx cdk deploy DuckDbOnAwsDemo --outputs-file cdk-outputs.json

npm run demo:prepare
npm run demo:verify
npm run demo:concurrency
npm run demo:quack:start
```

Quack 客户端需要两个终端：

```bash
# Terminal A: 保持 SSM 端口转发
scripts/quack-tunnel.sh

# Terminal B: 运行本地 DuckDB 客户端
npm run demo:quack:client
```

结束 Quack 或销毁整个环境：

```bash
npm run demo:quack:stop
scripts/destroy.sh
```

## 阅读顺序

1. [12 分钟 Demo 讲稿](docs/DEMO_NARRATIVE_CN.md)
2. [架构设计](docs/ARCHITECTURE_CN.md)
3. [操作手册](docs/RUNBOOK_CN.md)
4. [验证记录](docs/IMPLEMENTATION_RECORD_CN.md)
5. [DuckDB 核心能力与使用场景调研](DUCKDB_DEEP_RESEARCH_CN.md)
6. [社区实践、生态与厂商动作调研](DUCKDB_ECOSYSTEM_COMMUNITY_RESEARCH_CN.md)
7. [发布检查清单](docs/PUBLISHING_CHECKLIST_CN.md)

## 能力边界

- S3 Tables 是托管 Apache Iceberg，不是 DuckLake。
- DuckLake 1.0 是开放湖仓格式，但 Athena、Redshift 和 Glue 目前不会原生解析它的 catalog。
- Quack 是 DuckDB `v1.5.3` 引入的 beta 远程协议与扩展，不是高可用分布式数据库服务。
- 这个环境采用单 AZ、短备份和可销毁存储策略，只用于技术验证。

## 说明

本仓库是个人技术研究与演示，不是 AWS 产品，不代表 AWS 服务路线图、正式架构建议、SLA 或支持承诺。文档中的产品状态和社区数据以各自标注的调研日期为准，正式选型前应重新核对一手资料。

代码和文档按 [Apache License 2.0](LICENSE) 发布。
