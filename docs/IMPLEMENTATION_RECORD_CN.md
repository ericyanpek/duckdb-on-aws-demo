# 验证记录

下面是 2026-08-27 在一个隔离 AWS 账号中完成的端到端验证。公开版本不保留账号 ID、实例 ID、ARN、bucket 名称和临时 token。

## 环境

| 项目 | 值 |
|---|---|
| 日期 | 2026-08-27 |
| Region | `us-east-1` |
| CloudFormation Stack | `DuckDbOnAwsDemo` |
| DuckDB | `v1.5.3 (Variegata) 14eca11bd9` |
| S3 Tables namespace/table | `demo.events` |
| Quack | DuckDB v1.5.3 core extension，loopback only |

Demo 固定 `v1.5.3` 是为了验证当时发布的 Quack beta。调研文档以更新的 `v1.5.5` 为产品基线，两者用途不同。

## 部署

- CDK bootstrap stack：`UPDATE_COMPLETE`
- Bootstrap version：`30`
- `cdk synth --strict`：通过
- `cdk-nag AwsSolutionsChecks`：通过；Demo 取舍使用资源级确认
- CDK deployment：成功
- 初次部署耗时：约 560 秒
- SSM Agent：Online
- EC2 cloud-init：done

## 三条数据路径

初始化后，独立验证进程得到以下结果：

| source | rows | revenue |
|---|---:|---:|
| ducklake | 100000 | 10231500.0 |
| s3_parquet | 100000 | 10231500.0 |
| s3_tables | 100000 | 10231500.0 |

这不是初始化 SQL 进程中的缓存结果。

## DuckLake 并发与时间旅行

两个独立 DuckDB writer 各写入 1,000 行：

| before_snapshot | after_snapshot | rows_before | rows_after |
|---:|---:|---:|---:|
| 10 | 12 | 100000 | 102000 |

写入分布：

| region | rows |
|---|---:|
| writer-1 | 1000 |
| writer-2 | 1000 |

两个进程都成功提交到同一个 DuckLake。写入前的 snapshot 仍可查询 10 万行，当前 snapshot 为 10.2 万行。

## Quack

验证路径如下：

```text
Local DuckDB 1.5.3
  -> localhost:9494
  -> SSM port forwarding
  -> EC2 loopback:9494
  -> Quack
  -> attached DuckLake and S3 Tables catalogs
```

本地客户端通过 Quack 得到：

| source | rows | revenue |
|---|---:|---:|
| ducklake | 102000 | 10541490.0 |
| s3_tables | 100000 | 10231500.0 |

验证后关闭了 SSM tunnel。Quack 是否继续运行不影响 CloudFormation 资源计费；不再使用时应运行 `npm run demo:quack:stop` 或直接执行 `scripts/destroy.sh`。

## 实现中处理过的问题

1. 并发 Demo 的 time-travel 连接最初没有创建 S3 credential chain secret。两个并发提交已经成功，但读取新 Parquet 文件返回 403。补齐 secret 后，重新初始化并完整通过。
2. 本地 Quack client 将 extension home 固定到仓库忽略的 `.tools/home`，避免依赖用户 `~/.duckdb` 的写权限。
3. `remote-command.sh` 在 SSM waiter 失败后仍会读取远端 stderr，避免只返回一个没有上下文的等待错误。

## 如何使用这份记录

这些数字证明本仓库对应版本曾完成一次真实部署，不构成持续可用性或性能承诺。AWS 服务、DuckDB extension 和云厂商产品状态都会变化；发布新版本前应按[操作手册](RUNBOOK_CN.md)重新走一遍完整流程。

## 一手资料

- [DuckDB Quack overview](https://duckdb.org/docs/current/quack/overview.html)
- [DuckDB Quack deployment](https://duckdb.org/docs/current/quack/setup/deployment.html)
- [DuckLake stable documentation](https://ducklake.select/docs/stable/)
- [DuckLake PostgreSQL catalog](https://ducklake.select/docs/stable/duckdb/usage/choosing_a_catalog_database)
- [DuckLake snapshots](https://ducklake.select/docs/stable/duckdb/usage/snapshots)
- [AWS: S3 Tables with DuckDB](https://aws.amazon.com/blogs/storage/streamlining-access-to-tabular-datasets-stored-in-amazon-s3-tables-with-duckdb/)
- [S3 Tables Iceberg REST endpoint](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-integrating-open-source.html)
