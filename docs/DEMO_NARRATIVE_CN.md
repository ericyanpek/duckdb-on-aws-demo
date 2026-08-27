# 12 分钟 Demo 讲稿

## 这次要讲清楚什么

这次不从 Benchmark 开始，而是看 DuckDB 如何进入一套真实的数据架构：

> DuckDB 负责单节点分析计算；数据可以留在对象存储；Iceberg 或 DuckLake 提供表与事务语义；Quack 把已经准备好的 DuckDB 会话交给远程客户端。

四者不是一个产品，也不处在同一层。Demo 的重点是看清每一层解决了什么，以及哪些责任仍要由应用或云平台承担。

## 时间安排

| 时间 | 画面 | 讲述重点 |
|---|---|---|
| 0:00-1:30 | 架构图 | DuckDB 是计算引擎；S3、S3 Tables、RDS 承担不同持久化职责。 |
| 1:30-4:00 | `demo:prepare` 输出 | 同一份 10 万行数据分别落在 S3 Parquet、S3 Tables Iceberg、DuckLake，三者行数和聚合结果一致。 |
| 4:00-6:30 | 查询 SQL | S3 Parquet 是文件路径；S3 Tables 提供 Iceberg 表、快照和托管维护；DuckLake 使用 SQL catalog + Parquet。 |
| 6:30-9:00 | `demo:concurrency` 输出 | 两个独立 DuckDB writer 并发提交。当前快照增加 2,000 行，旧快照仍保持 10 万行。 |
| 9:00-11:00 | Quack 本地客户端 | 通过 SSM tunnel 远程执行一条 SQL，同时读取远端会话里的 DuckLake 和 S3 Tables。 |
| 11:00-12:00 | 适用场景与边界 | 说明什么已成熟、什么仍是 beta，以及 AWS 托管服务和开源组件的责任边界。 |

## 场景一：直接分析对象存储中的数据

运行：

```bash
npm run demo:prepare
```

预期看到：

```text
source       rows    revenue
ducklake     100000  10231500.0
s3_parquet   100000  10231500.0
s3_tables    100000  10231500.0
```

讲解时说明：

- DuckDB 可以直接在 S3 Parquet 上执行列式分析。
- 直接文件查询很简单，但文件名本身不提供事务、快照、schema 演进或并发提交协议。
- 当需要跨引擎开放表语义时，S3 Tables 提供托管 Iceberg。
- 当主要客户端是 DuckDB、希望用关系数据库管理 lakehouse 元数据时，DuckLake 是更轻的路线。

## 场景二：两个 DuckDB writer 共享 DuckLake

运行：

```bash
npm run demo:concurrency
```

实际验收结果：

```text
before_snapshot  after_snapshot  rows_before  rows_after
10               12              100000       102000

region    rows
writer-1  1000
writer-2  1000
```

讲解时说明：

- 两个 writer 是两个独立 DuckDB 进程，不是同一进程里的两个 connection。
- PostgreSQL catalog 负责 DuckLake 事务与冲突协调，数据文件仍在 S3。
- `AT (VERSION => 10)` 读取写入前状态，当前查询读取 snapshot 12。
- 这解决的是共享 lakehouse 数据集，不等于多个进程共同写同一个原生 `.duckdb` 文件。

## 场景三：从本地客户端访问远端 DuckDB 会话

先在远端启动 Quack：

```bash
npm run demo:quack:start
```

本地建立 SSM tunnel：

```bash
scripts/quack-tunnel.sh
```

另一个终端执行：

```bash
npm run demo:quack:client
```

实际验收结果：

```text
source      rows    revenue
ducklake    102000  10541490.0
s3_tables   100000  10231500.0
```

讲解时说明：

- Quack 不改变 DuckDB 的存储格式，也不替代 DuckLake catalog。
- Quack 将一个已加载扩展、已 ATTACH 数据源的 DuckDB 会话变成远程 SQL 执行端点。
- 本 Demo 使用 token authentication 和 SSM port forwarding，没有公开 HTTP 端口。
- Quack 当前是 beta。协议、函数和默认值仍可能变化，不应描述为 AWS 托管数据库或 HA 服务。

## 场景映射

| 场景 | 建议组合 |
|---|---|
| Notebook、CLI、应用内临时分析 | DuckDB + S3 Parquet |
| Athena、Redshift、EMR、Spark、DuckDB 跨引擎共享表 | S3 Tables Iceberg |
| 多个 DuckDB 进程共享读写 lakehouse | DuckLake + PostgreSQL/Aurora + S3 |
| 将准备好的 DuckDB 会话远程提供给本地工具或 agent | Quack，当前按 beta 对待 |
| 企业统一治理与细粒度权限 | 优先评估 S3 Tables + Glue/Lake Formation；不要把该能力自动外推到 DuckLake |

## 需要明确的边界

- AWS 目前没有在这个 Demo 中提供托管 DuckDB 服务。
- S3 Tables 是托管 Iceberg，不是 DuckLake。
- DuckLake 是开放湖仓格式，但不能据此推断所有引擎都会原生读写它。
- Lake Formation 不会原生治理 DuckLake catalog。
- Quack 提供远程协议和 Server 形态，不等于分布式 DuckDB 或高可用数据库实例。

## 后续扩展

主线之外还可以增加两个独立 Demo：

1. 使用 Athena 查询同一个 S3 Tables Iceberg 表，证明跨引擎互操作。
2. 使用 Amazon Bedrock AgentCore 或 Strands Agent 调用受限的 Quack 查询工具，展示 agentic analytics。
