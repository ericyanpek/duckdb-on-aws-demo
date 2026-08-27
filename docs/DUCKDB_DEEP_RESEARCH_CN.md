# DuckDB 核心能力与核心使用场景深度调研

> 调研基线：2026-08-27  
> 版本基线：[DuckDB v1.5.5](https://github.com/duckdb/duckdb/releases/tag/v1.5.5)；[DuckLake Specification v1.0](https://ducklake.select/2026/04/13/ducklake-10/)  
> 范围：DuckDB 核心引擎、原生数据库格式、扩展生态、DuckLake，以及典型 AWS 落地模式

## 1. 执行摘要

### 1.1 先给定义

DuckDB 是一个**进程内、单机并行、面向 OLAP 的 SQL 数据库引擎**。它把数据库级的 SQL、优化器、列式执行、事务和内存外计算能力，以库的形式嵌入 Python、Java、Go、Node.js、R、浏览器或应用程序中。

DuckDB 核心、核心扩展和 DuckLake 均采用宽松的 MIT 开源许可证。

它最准确的类比不是“小型数据仓库”，而是：

> **分析领域的 SQLite + 可直接查询 Parquet/对象存储的数据处理引擎。**

DuckLake 则不是 DuckDB 的执行引擎，也不是 DuckDB 原生文件的远程版本。它是一个独立的开放湖仓格式：

> **事务型 SQL 数据库保存目录和统计信息，对象存储保存不可变 Parquet 数据文件。**

### 1.2 六个判断

1. **DuckDB 最大的优势是数据局部性。**  
   它与应用处于同一进程，没有数据库服务部署和网络往返；同时能直接消费 Parquet、Arrow 和 DataFrame，减少序列化、复制和数据搬运。

2. **DuckDB 是单机 scale-up 引擎，不是分布式 scale-out 引擎。**  
   它可以用满单机 CPU、内存和本地磁盘，也可以处理超过内存的数据，但不会把一条查询自动分发到多个节点。

3. **直接查询对象存储不等于云数仓。**  
   Parquet 列裁剪、谓词下推、分区裁剪可以显著降低远程读取量，但 S3 请求延迟、小文件、网络吞吐和跨区域流量仍然决定性能与成本。

4. **DuckDB 原生数据库文件不是常规多进程共享写数据库；Quack 改变的是访问路径，不是文件并发模型。**  
   单进程内支持多连接、多线程和基于 MVCC/OCC 的并发写；多个进程可以只读同一文件。Quack 可让多个客户端通过网络把读写集中到一个 DuckDB Server 进程，但不会让多个进程直接安全地打开同一个 `.duckdb` 文件。需要多个独立计算实例共享写对象存储数据时，稳定主路径仍是 DuckLake + PostgreSQL 目录。

5. **DuckLake v1.0 已进入官方“面向生产”阶段，但生态成熟度仍弱于 Iceberg。**  
   DuckDB 是参考实现；DataFusion、Spark、Trino 和 PostgreSQL 客户端处于不同成熟阶段。若跨引擎互操作是第一优先级，Iceberg 通常仍是更保守的选择。

6. **DuckLake 不是零运维格式。**  
   小文件合并、重删除文件重写、快照过期、旧文件与孤儿文件清理、目录数据库维护、目录与对象存储的一致备份都需要显式设计。

### 1.3 最适合与最不适合的场景

**强适配：**

- 本地和交互式数据分析
- Notebook、数据科学和特征工程
- 应用内嵌分析
- Parquet/CSV/JSON 转换、清洗和单机 ETL
- S3 数据的按需 SQL 分析
- 数据质量、测试数据和流水线单元测试
- 浏览器内数据分析
- 中等规模、低运维成本的共享湖仓（DuckLake）

**弱适配或不适配：**

- 高频点查和高并发 OLTP
- 大量并发短查询的多租户 BI 服务
- 需要自动跨节点扩展的超大规模计算
- 将共享的 DuckDB 原生文件作为高可用主数据库
- 高冲突、高频更新、强约束的业务系统
- 将不可信 SQL 直接暴露给外部用户

---

## 2. DuckDB 到底是什么

### 2.1 进程模型

传统数据库采用 client-server 模型：

```text
Application -> network/driver -> database server -> storage
```

DuckDB 采用 in-process 模型：

```text
Application + DuckDB library -> local memory/disk or remote object storage
```

由此产生四个直接影响：

- **低启动和部署成本**：不需要单独数据库服务。
- **无网络序列化成本**：应用对象、Arrow 和 DataFrame 可以直接进入执行引擎。
- **资源边界等于宿主进程/机器**：CPU、内存、临时磁盘和故障域都由宿主负责。
- **安全边界不是数据库服务边界**：DuckDB SQL 和扩展拥有宿主进程的文件、网络和系统权限。

### 2.2 与 SQLite 的关系

两者都强调嵌入式、单文件和易部署，但优化目标相反：

| 维度 | SQLite | DuckDB |
|---|---|---|
| 主要负载 | OLTP、点查、小事务 | OLAP、扫描、聚合、连接 |
| 存储方向 | 行式 | 列式 |
| 执行方式 | 适合逐行访问 | 向量化、批量处理 |
| 并行分析 | 不是核心目标 | 单查询多线程 |
| 分析 SQL | 基础能力 | 窗口、复杂类型、PIVOT、ASOF JOIN 等 |
| 外部数据 | 通常先导入 | 可直接查询 Parquet/CSV/JSON/Arrow |

所以 DuckDB 不是 SQLite 的替代品，而是补足了 SQLite 不擅长的分析侧负载。

### 2.3 与 DataFrame 引擎的关系

Pandas、Polars 和 DuckDB 有重叠，但抽象不同：

- Pandas/Polars 以 DataFrame API 和程序语言表达式为中心。
- DuckDB 以关系模型、SQL、优化器、事务和目录为中心。
- DuckDB 可以直接查询 Pandas/Arrow/Polars 数据，并将结果返回为同类对象。
- Arrow 路径能够减少或避免不必要的数据复制。

实际工程中通常不是二选一，而是：

```text
Python orchestration
  + DuckDB: join / aggregate / SQL / file scan
  + Polars or Pandas: domain-specific dataframe manipulation
  + Arrow: in-memory interchange
```

---

## 3. 核心技术架构

### 3.1 向量化执行

DuckDB 不是一次处理一行，而是以向量/数据块为单位处理数据。官方资料中常见的数据块大小为 2,048 行。

主要收益：

- 摊薄解释器和函数调用开销
- 改善 CPU cache locality
- 便于 SIMD 和批量表达式求值
- 容易在线程间拆分工作
- 与 Arrow、Parquet 的列式组织方式相匹配

这解释了为什么 DuckDB 对全表扫描、过滤、聚合、排序和连接通常远快于逐行 Python 处理。

### 3.2 列式存储与统计信息

DuckDB 原生格式按列组织数据，并基于 row group 并行扫描。默认 row group 为 122,880 行；查询要让 `k` 个线程都参与扫描，至少需要约 `k * 122,880` 行可扫描数据。

列式存储适合分析负载，因为：

- 查询只读取需要的列
- 同类型数据更容易压缩
- 每列 min/max 等统计信息可用于跳过无关数据块
- 聚合和向量表达式对连续列数据更友好

代价是单行高频更新、点查和大量小事务并非主要优化方向。

### 3.3 成本优化器

DuckDB 具有数据库级优化器，而不是简单的 SQL 解释器：

- 谓词下推
- 投影下推
- 常量折叠和表达式重写
- 基于统计信息的基数估计
- Join order 和 Join algorithm 选择
- Top-N 等算子优化

`EXPLAIN` 和 `EXPLAIN ANALYZE` 可以查看物理计划、估计/实际基数、算子时间，以及远程文件查询时的请求数和传输量。

### 3.4 单机并行

DuckDB 使用 morsel-driven parallelism，把扫描、聚合、连接、排序等工作拆分到多个线程。

应注意：

- 单条大查询通常能利用多核。
- 并非所有算子和数据规模都能充分并行。
- 线程数不是越高越好；超线程和内存带宽可能造成反效果。
- 远程文件读取使用同步 I/O，每个 DuckDB 线程同时最多发起一个 HTTP 请求。网络受限场景可能需要比 CPU 核数更多的线程。

### 3.5 内存外计算

DuckDB 可以把中间数据溢写到临时目录，使查询数据或中间结果超过内存。官方明确支持以下关键算子的内存外处理：

- `GROUP BY`
- `JOIN`
- `ORDER BY`
- Window functions

但“支持 larger-than-memory”不等于所有查询都不会 OOM：

- 部分需要保存复杂中间状态的 holistic aggregates 仍可能耗尽内存。
- 高基数、宽行、复杂嵌套类型和 Python UDF 会改变内存行为。
- 临时磁盘容量、吞吐和位置会显著影响执行。

生产使用时应显式设置：

```sql
SET memory_limit = '...';
SET temp_directory = '...';
SET threads = ...;
```

### 3.6 事务与并发

DuckDB 原生格式支持 ACID、WAL、MVCC 和 optimistic concurrency control。

单进程内：

- 多线程追加同一表不会冲突。
- 不同表或同一表不同数据子集的更新可并发。
- 同一行被两个事务同时更新/删除时，其中一个事务会报冲突，应用需要重试。

多进程：

- 一个进程可以读写原生数据库文件。
- 多个进程可以只读同一文件。
- 多进程直接共享写原生文件不是传统稳定模型。
- Quack 可以让多个客户端连接到**同一个持有数据库文件的 Server 进程**，因此能够间接实现多客户端读写；它没有改变原生文件的单进程写入所有权。
- Quack remote protocol 从 DuckDB v1.5.3 起作为 core extension 发布，目前处于 beta，协议、函数名、配置和默认值仍可能变化；官方计划在 DuckDB v2.0 使其进入稳定状态。
- 当前稳定的多进程共享读写建议是 DuckLake + PostgreSQL 目录。

这决定了 DuckDB 原生文件适合**进程内数据库**，而不是直接充当共享数据库服务器的数据文件。

---

## 4. 能力概览

### 4.1 SQL 与数据模型

DuckDB SQL 接近 PostgreSQL，同时针对分析做了大量扩展：

- CTE、递归 CTE、窗口函数、相关子查询
- `PIVOT` / `UNPIVOT`
- `QUALIFY`
- `ASOF JOIN`、位置连接、半连接、反连接
- `GROUPING SETS`、`CUBE`、`ROLLUP`
- `MERGE INTO`
- `SELECT * EXCLUDE/REPLACE`
- `UNION BY NAME`、`INSERT BY NAME`
- `SUMMARIZE`
- 宏、表宏、Python UDF
- `LIST`、`STRUCT`、`MAP`、`UNION` 等嵌套类型
- JSON、日期时间、正则、统计等丰富函数

这让 DuckDB 既可作为数据库，也可作为 SQL 数据处理 DSL 的运行时。

### 4.2 文件与开放格式

核心常用格式：

- Parquet：读写、列裁剪、谓词下推、row-group pruning
- CSV：自动识别 schema、分隔符、header 和类型
- JSON：读取、转换和写出
- Arrow：批量、低复制内存交换
- Avro、Excel、空间数据等：通过扩展支持

Parquet 是 DuckDB 最自然的外部存储格式。查询时：

```sql
SELECT customer_id, sum(amount)
FROM read_parquet('s3://bucket/orders/year=*/month=*/*.parquet',
                  hive_partitioning = true)
WHERE year = 2026 AND month = 8
GROUP BY customer_id;
```

优化可以发生在三层：

1. Hive partition pruning：跳过目录/文件。
2. Parquet statistics：跳过 row group。
3. Projection pushdown：只下载并解码所需列。

### 4.3 对象存储与云访问

`httpfs`/AWS 扩展支持 HTTP(S)、S3 和 S3-compatible storage。凭证可通过 DuckDB Secret Manager 和 AWS credential chain 获得。

优势：

- 不需要先把完整数据集下载到本地。
- 查询只读取需要的文件范围和列。
- 可以直接把查询结果写回 Parquet/S3。

关键限制：

- 远程请求延迟可能高于计算时间。
- 大量小文件会造成 S3 `GET`/`HEAD` 放大。
- 冷缓存和热缓存性能差异显著。
- 读取原始 CSV/JSON 无法获得 Parquet 同等级别的列裁剪与统计跳过。
- 数据布局不合理时，DuckDB 无法凭空消除网络 I/O。

### 4.4 DataFrame 与语言集成

主要客户端包括 Python、R、Java/JDBC、C/C++、Go、Rust、Node.js、Swift 和 Wasm。

Python 中可以直接：

- 对 Pandas DataFrame 写 SQL
- 读取/返回 Arrow Table、RecordBatchReader
- 与 Polars 通过 Arrow 交互
- 注册 scalar Python UDF
- 使用关系 API 组合查询

Replacement Scan 允许 `FROM df` 自动把 Python 变量解析为数据源，降低了 SQL 与 DataFrame 的切换成本。

### 4.5 数据库联邦与迁移

DuckDB 可通过扩展直接连接并查询：

- PostgreSQL
- MySQL
- SQLite

这类 scanner/attach 能力适合：

- 把 OLTP 数据抽取为 Parquet
- 跨数据库做一次性分析
- 轻量数据迁移和验证
- 在不改动源系统的情况下执行复杂分析

它不应被误解为面向大规模生产的通用联邦查询层；网络传输、源库下推能力和源库负载仍需验证。

### 4.6 湖仓格式

DuckDB 可通过扩展使用：

- Apache Iceberg
- Delta Lake
- DuckLake
- Unity Catalog 等目录

不同扩展的读写能力和稳定级别并不相同。选型时必须按具体版本逐项核验，不能用“支持该格式”推导出完整 DDL/DML、事务和所有目录能力都可用。

### 4.7 扩展体系

扩展可以增加：

- 文件系统和格式
- 类型和函数
- 数据库 scanner
- 空间分析
- 全文检索
- 向量相似度搜索
- UI 和远程协议

扩展是 DuckDB 生态快速扩张的关键，也扩大了供应链和权限风险：

- 扩展与 DuckDB 宿主进程具有相同权限。
- 官方 core extensions 与 community extensions 的信任级别不同。
- 生产环境应固定版本、控制扩展来源、禁用 unsigned/community extension，并锁定安全配置。

### 4.8 浏览器内分析

DuckDB-Wasm 可在浏览器中运行 SQL，并读取用户本地文件或远程数据。

适合：

- 数据不离开浏览器的隐私分析
- 静态站点上的交互式数据产品
- 本地 CSV/Parquet explorer
- 教学和可复现实验

限制包括浏览器内存、线程和跨域策略，扩展支持也与 native DuckDB 不完全一致。

### 4.9 Quack 远程协议与 Server 形态

Quack 是 DuckDB 官方开发的远程 RPC 协议和 core extension。它不是新的数据库文件格式、独立执行引擎或 `DatabaseInstance` 类型，而是把一个已有 DuckDB 实例暴露为网络服务：

```text
DuckDB client process
  + Quack client extension
        |
        | HTTP(S), quack: URI
        v
DuckDB server process
  + Quack server extension
  + in-memory/native DuckDB
  + attached Parquet/S3/Iceberg/DuckLake
```

Server 从一个已有 DuckDB session 启动：

```sql
CALL quack_serve(
    'quack:localhost',
    token = 'a-long-random-token'
);
```

Client 仍先创建一个本地 DuckDB 实例，再通过 Quack 查询或挂载远端：

```sql
CREATE SECRET (
    TYPE quack,
    TOKEN 'a-long-random-token',
    SCOPE 'quack:server.example.com'
);

ATTACH 'quack:server.example.com' AS remote_db (TYPE quack);
SELECT * FROM remote_db.main.orders;
```

#### 协议和会话模型

- 默认 URI scheme 为 `quack:`，默认端口为 `9494`。
- 传输采用 Client 驱动的 HTTP request/response；Server 不主动 push。
- Payload 使用 DuckDB 自身的 `application/duckdb` 序列化路径，而不是先转换为 Arrow、JSON 或 PostgreSQL wire format，复杂和嵌套类型可以无损传输。
- `quack_query(...)` 面向无状态单次查询。
- `ATTACH ... (TYPE quack)` 把远端暴露为完整 catalog，并可保留临时表、`SET` 变量等 Server 侧连接状态。
- SQL 的主要执行和数据访问发生在 Server 机器；Client 端本地 DuckDB 仍负责本地 catalog、连接和结果消费。
- Quack 不是通用 PostgreSQL/MySQL wire protocol。当前典型 Client 也需要 DuckDB 和 Quack extension；例如 JDBC 是先打开本地 DuckDB 连接，再 `ATTACH` 远端。

#### Quack 解决的问题

- 从另一台机器访问 DuckDB。
- 让多个 Client 共享一个由 Server 进程持有的原生 DuckDB 文件或内存状态。
- 把 DuckDB 作为应用内部的轻量分析微服务。
- 让 DuckDB-Wasm、CLI 或其他 DuckDB Client 查询远端计算实例。
- 通过 Server 统一控制可见的本地文件、Attached Catalog 和扩展。

#### Quack 不解决的问题

- 不会把一条查询自动分布到多个 Server。
- 不提供多副本、自动故障转移、共识或跨节点事务。
- 不提供完整的用户目录、IAM/RBAC、租户计费和 workload management。
- 不改变 `.duckdb` 文件的单进程写入所有权。
- 不等价于 MotherDuck 等托管数据库服务。
- 不替代 DuckLake；Quack 解决远程访问，DuckLake 解决多个计算实例共享湖仓数据和事务。

#### Quack 位于哪一层

| 组件 | 本质 | 计算位置 | 状态/数据位置 | 解决的核心问题 |
|---|---|---|---|---|
| Embedded DuckDB | 进程内 OLAP 引擎 | 应用进程 | 内存、原生文件、外部文件 | 本地和应用内分析 |
| Quack | DuckDB-to-DuckDB RPC 协议和 Server facade | Quack Server | Server 可见的 DuckDB、文件和 Attached Catalog | 远程访问同一 DuckDB 实例 |
| DuckLake | 开放湖仓格式和事务 Catalog 规范 | DuckDB 或其他实现 | SQL catalog + 对象存储 Parquet | 多计算实例共享湖仓数据 |
| MotherDuck | 商业托管 DuckDB 服务 | MotherDuck 云端及本地协同 | 托管存储和控制面 | 身份、共享、并发、备份和多租户运营 |

Quack 和 DuckLake 可以组合，但不是上下位替代：

```text
DuckDB client
  -> Quack
  -> DuckDB compute server
  -> DuckLake catalog + object storage
```

在这个组合中，Quack 负责 Client/Server 通信，DuckDB 执行 SQL，DuckLake 负责共享数据和事务。

#### 部署和安全边界

Quack Server 原生只提供 HTTP，并默认绑定 localhost。非本机部署时，官方建议：

```text
DuckDB clients
  -> HTTPS
  -> nginx/Caddy or another hardened reverse proxy
  -> localhost HTTP
  -> DuckDB + Quack
```

默认安全能力包括随机 Token、非本地地址显式开放，以及认证/授权 callback。它仍不是完整身份平台。生产部署至少需要：

- TLS 终止和证书轮换。
- Secret 托管与 Token 轮换。
- 网络边界和访问日志。
- SQL 授权、扫描量、超时和结果行数限制。
- Server 进程监管、持久卷、备份和恢复。
- 固定 DuckDB/Quack 版本并执行 Client/Server 兼容测试。

截至 2026-08-27，Quack 自 DuckDB v1.5.3 起随 core repository 发布，但仍为 beta/experimental。官方计划随 DuckDB v2.0 进入稳定状态，因此当前适合 PoC、内部受控访问和可接受协议升级的自托管场景，不宜直接视为成熟的通用数据库服务。

---

## 5. 核心场景适配矩阵

| 场景 | 适配度 | 推荐模式 | 主要原因 | 主要风险 |
|---|---:|---|---|---|
| 本地临时分析 | 极高 | CLI/Python + 文件 | 零服务、直接 SQL 文件 | 本地资源上限 |
| Notebook/数据科学 | 极高 | Python/R + Arrow/DataFrame | 少复制、SQL 与 DataFrame 互补 | Python UDF 可能破坏性能 |
| Parquet 清洗转换 | 极高 | `COPY`/CTAS | 列式、并行、单机吞吐高 | 小文件和临时盘 |
| 嵌入式应用分析 | 极高 | client library + native DB | 无网络跳转、部署简单 | 与宿主共享资源和故障域 |
| S3 按需查询 | 高 | DuckDB + httpfs/AWS | 下推和范围读取 | 网络、小文件、并发 |
| 单机批处理 ETL | 高 | 容器/Batch job | 无集群、成本低 | 超过单机后无自动扩展 |
| 数据库抽取/迁移 | 高 | scanner + Parquet | 可直接 ATTACH 源库 | 源库压力与下推边界 |
| 数据质量/流水线测试 | 高 | 内存库/临时文件 | 启动快、SQL 完整 | 与目标引擎语义差异 |
| 浏览器数据产品 | 高 | DuckDB-Wasm | 数据本地处理 | 浏览器资源、CORS |
| 空间分析 | 中高 | spatial extension | SQL + GDAL/GEOS/PROJ | 大几何对象内存占用 |
| 共享湖仓 | 中高 | DuckLake + PostgreSQL + object store | 多客户端、事务、快照 | 新生态与运维面 |
| 轻量远程 DuckDB | 中/试验 | DuckDB + Quack + TLS proxy | 官方 Client-Server 路径、共享同一实例 | Beta、HA、鉴权和资源治理 |
| 后端分析 API | 中 | 受控进程池/只读数据 | 单实例查询快 | 多租户隔离和并发 |
| Serverless function | 中 | 只读/短批任务 | 启动简单、无需服务 | 包大小、临时盘、超时、冷启动 |
| 高频 micro-batch 更新 | 中低 | DuckLake + 定期维护 | 能写入和更新 | 小文件、delete files |
| 大规模多租户 BI | 低 | 更适合专用服务型引擎 | DuckDB 非高并发短查询目标 | 调度、隔离、HA |
| OLTP 主库 | 很低 | PostgreSQL/MySQL 等 | DuckDB 优化目标不同 | 点查、约束、冲突、服务能力 |
| 自动分布式 PB 计算 | 很低 | Spark/Trino/云数仓 | DuckDB 不做跨节点执行 | 单机资源上限 |

---

## 6. 场景深挖

### 6.1 本地分析与探索

这是 DuckDB 最自然的场景。

典型工作流：

```text
CSV/JSON/Parquet -> DuckDB SQL -> sample/profile/join/aggregate -> Parquet/Arrow
```

价值：

- 无需上传数据或创建表。
- SQL 可直接复用到脚本、测试和流水线。
- `SUMMARIZE`、schema inference 和 friendly SQL 提升探索效率。
- 比把全部数据加载到 Pandas 更节省内存。

### 6.2 数据科学与特征工程

DuckDB 适合执行关系型、扫描密集型步骤：

- 多表连接
- 时间窗口
- 训练样本聚合
- 宽表构建
- point-in-time/ASOF join
- 从 S3 Parquet 选择训练子集

推荐分工：

- DuckDB 负责读取、过滤、Join、Aggregate。
- Arrow 负责内存交换。
- Python/Polars 负责算法和领域变换。

避免对每行调用普通 Python UDF；优先使用内建 SQL 函数或 Arrow vectorized UDF。

### 6.3 嵌入式分析

例如：

- 桌面应用内的报表和搜索
- SaaS agent/process 内的本地分析
- 日志工具和数据质量工具
- 每客户一个数据库文件的单租户分析
- 离线优先应用

优势是部署极简和本地数据访问。架构上应把 DuckDB 视为应用组件：

- 应用负责连接生命周期。
- 应用负责查询超时、资源限制和取消。
- 应用升级时要测试文件格式和扩展兼容性。
- 应用崩溃与数据库查询处于同一故障域。

### 6.4 单机 ETL/ELT

DuckDB 很适合“中等规模、可放进一台大机器”的批处理：

```sql
COPY (
  SELECT ...
  FROM read_parquet('s3://raw/.../*.parquet')
  JOIN ...
) TO 's3://curated/...'
  (FORMAT parquet, PARTITION_BY (...), COMPRESSION zstd);
```

与 Spark 相比：

- 无 driver/executor 和 shuffle 集群管理。
- 对 GB 到低 TB 级、可单机完成的工作往往更简单。
- 当单机 CPU、内存、磁盘或网络成为硬上限时，需要切换到分布式引擎，而不是继续堆叠 DuckDB 进程来模拟分布式 SQL。

### 6.5 S3 上的交互式查询

DuckDB 适合：

- 已知数据路径上的定向分析
- 高选择性 Parquet 查询
- 分区和排序良好的数据集
- 查询结果较小、计算在本地完成的场景

不适合：

- 数百万小文件的全目录发现
- 高频重复扫描远程大数据
- 大量并发用户各自扫描同一数据
- 需要中心化 workload management 的 BI 服务

优化优先级：

1. 先优化文件布局，再优化 SQL。
2. 使用 Parquet，避免分析路径上的 CSV/JSON。
3. 控制文件大小，避免小文件。
4. 按高频过滤列组织分区或排序。
5. 禁止无必要的 `SELECT *`。
6. 使用 `EXPLAIN ANALYZE` 观察请求数和传输字节。
7. 把重复使用的数据物化到本地 DuckDB 或本地 Parquet 缓存。

### 6.6 后端 API 和多用户服务

DuckDB 可以作为服务内部的执行引擎，但必须区分：

- “应用内有一个分析功能”
- “通过 Quack 把一个 DuckDB 实例提供给少量受控 Client”
- “把 DuckDB 暴露成公共数据库服务”

前两者可以采用 embedded DuckDB 或 Quack；公共数据库服务仍需要大量自建能力：

- 进程和线程调度
- 查询队列、取消和超时
- CPU/内存/临时盘隔离
- 租户鉴权和数据权限
- 扩展白名单
- 不可信 SQL 沙箱
- 高可用和故障恢复

若需求本质是高并发、多租户分析数据库，ClickHouse、Trino、云数仓或托管 DuckDB 服务通常更符合问题形态。

Quack 适合的是轻量远程化，而不是自动补齐服务控制面。典型适用条件：

- Client 本身可以运行 DuckDB。
- Server 数量少，实例所有权明确。
- 查询者受信任或 SQL 已经过代理约束。
- 可以接受单节点故障域并自行实现进程监管和备份。
- 需要共享一个 DuckDB catalog/session，或希望把数据计算留在远端机器。

---

## 7. DuckLake 深度分析

### 7.1 DuckLake 解决的问题

DuckDB 原生格式是高效单文件数据库，但不适合：

- 多个独立进程共享写
- 对象存储上的超大数据集合
- 跨客户端共享快照和表目录

裸 Parquet 又缺少：

- 原子提交
- 表级 schema
- 快照和 time travel
- update/delete 语义
- 文件级统计与目录

DuckLake 在两者之间提供湖仓抽象。

### 7.2 两层架构

```text
                         +----------------------+
DuckDB / other clients ->| Transactional SQL DB |
                         | catalog + statistics |
                         +----------+-----------+
                                    |
                                    | file paths, snapshots,
                                    | schema, min/max, deletes
                                    v
                         +----------------------+
                         | Object/File Storage  |
                         | immutable Parquet    |
                         +----------------------+
```

目录数据库要求支持事务和主键约束。官方支持/说明的选择包括：

- DuckDB catalog：最简单，但只适合单客户端。
- PostgreSQL 12+：官方推荐的远程、多用户目录。
- SQLite：本地轻量目录。
- MySQL：通过 DuckDB MySQL extension 使用。

数据可以位于本地文件系统、S3/S3-compatible、Azure、GCS、NFS/SMB/FUSE 等 DuckDB 可访问的后端。

### 7.3 快照和事务

DuckLake 中一次已提交的 `BEGIN`/`COMMIT` 事务对应一个 snapshot。快照代表整个 DuckLake 数据库的一致状态，因此可以：

- 对多个表进行原子修改
- 按 snapshot id 或 timestamp 做 time travel
- 查询历史 schema 和数据文件集合

并发提交使用目录数据库事务和主键冲突检测：

- 两个 writer 尝试提交相同 snapshot id 时，其中一个失败。
- DuckLake 检查中间快照的高层 changeset。
- 无逻辑冲突时自动重试元数据提交，通常无需重写数据文件。
- 有逻辑冲突时中止并返回错误。

这比仅依赖对象存储上的文件级乐观提交更容易理解和观测，但目录数据库成为可用性与延迟路径的一部分。

### 7.4 数据写入、更新和删除

DuckLake 不修改或追加现有 Parquet 文件。

- Insert：写新 Parquet 文件，并在目录中注册。
- Delete：写 positional delete file；读取时 merge-on-read。
- Update：逻辑上是 delete + insert。
- Merge：支持 upsert，但当前 DuckDB extension 对复杂 `MERGE INTO` action 组合仍有限制。

Merge-on-read 使更新提交较轻，但有读放大：

- delete file 增多后，读取必须额外合并。
- 重删除表需要执行 `ducklake_rewrite_data_files`。
- 小批写入会产生小 Parquet 文件，需要定期 compaction。

### 7.5 Schema evolution

DuckLake 可以在不重写旧文件的情况下：

- 新增列
- 删除列
- 重命名列
- 进行允许的类型提升

目录为列维护稳定 field id。读取历史文件时：

- 新列在旧文件中缺失，使用初始默认值。
- 已删除列即使仍存在于旧文件也会被忽略。
- 类型提升时把旧类型转换为当前类型。

这是湖仓格式相对于裸 Parquet 目录的重要能力。

### 7.6 分区和文件裁剪

DuckLake 维护文件级 min/max 等统计信息，并支持表分区。规划器先查询目录，得到满足过滤条件的候选文件，再由 DuckDB 对 Parquet 做 row-group 和列级裁剪。

需要注意：

- 分区不是越细越好。
- 高基数分区会产生大量目录项和小文件。
- 对有序数据，文件级 min/max 本身可能已经能有效裁剪。
- 分区设计应基于高频过滤模式，而不是机械复制 Hive 习惯。

### 7.7 不支持或不适合的能力

DuckLake v1.0 当前不支持或不适合：

- Index
- Primary key / enforced unique constraint
- Foreign key
- `CHECK` constraint
- User-defined type
- 固定长度 `ARRAY`
- `ENUM`
- Generated column
- 高频点更新和强约束 OLTP

Primary key、unique 和 foreign key 在数据湖中全局强制成本很高，官方认为其未来也不太可能以传统数据库方式实现。

### 7.8 客户端与互操作性

DuckDB `ducklake` extension 是参考实现。官方文档列出的其他实现包括：

- DataFusion
- Spark
- 两个社区 Trino 实现
- PostgreSQL `pg_ducklake`

这些实现处于不同成熟阶段。MotherDuck 的 DuckLake v1.0 托管能力当前为 public preview。

因此，选型时应把“开放规范”和“成熟的多引擎互操作”分开：

- 格式规范开放，不代表每个引擎已完整实现。
- 需要用实际 DDL、DML、删除、schema evolution 和 time travel 测试客户端兼容矩阵。

### 7.9 运维生命周期

至少需要以下周期任务：

| 任务 | 目的 |
|---|---|
| `ducklake_merge_adjacent_files` | 合并小文件 |
| `ducklake_rewrite_data_files` | 重写 delete 比例高的文件 |
| `ducklake_expire_snapshots` | 结束历史快照保留 |
| `ducklake_cleanup_old_files` | 删除已过期快照的旧文件 |
| `ducklake_delete_orphaned_files` | 清理目录未跟踪的孤儿文件 |
| catalog `VACUUM`/数据库维护 | 保持元数据数据库性能 |
| catalog backup/PITR + object versioning | 恢复目录与数据 |

几个关键事实：

- Drop table 不会立即删除数据文件。
- Expire snapshot 也不会立即删除物理文件。
- Compaction 后旧文件仍需在保留期后清理。
- 目录备份之后提交的数据文件，在只恢复旧目录时会成为未跟踪数据。
- 手工备份前应协调 compaction 和 cleanup，避免备份期间改变文件布局。

### 7.10 权限模型

DuckLake 本身没有完整实现 reader/writer/admin 角色系统，而是组合：

- 目录数据库的 schema/table 权限
- 对象存储的 bucket/prefix 权限

这会产生双平面授权问题：

- 目录允许但对象存储拒绝
- 对象存储允许但目录中不可见
- 创建空表只修改目录，首次写入才触发对象权限

需要用端到端事务测试权限，而不能只检查 PostgreSQL grant 或 S3 policy 的单一一侧。

---

## 8. DuckDB、DuckLake 与其他湖仓格式

### 8.1 原生 DuckDB vs 裸 Parquet vs DuckLake

| 维度 | DuckDB 原生文件 | 裸 Parquet | DuckLake |
|---|---|---|---|
| 部署 | 单文件、最简单 | 文件集合 | SQL catalog + 文件 |
| 事务 | 完整 ACID | 无 | 快照事务 |
| 多进程写 | 不能直接共享写；Quack 可经单一 Server 间接写 | 应用自行协调 | 多实例通过 PostgreSQL catalog 协调 |
| 远程访问 | Quack beta 可暴露 Server | HTTP/S3 文件访问 | 各实现直接访问 catalog + 对象存储，也可由 Quack Server 代理 |
| 对象存储 | 适合外部扫描，不适合把原生文件当共享写存储 | 原生适合 | 原生适合 |
| Schema evolution | 数据库 DDL | 自行约定 | 格式级支持 |
| Time travel | 非湖仓式历史快照 | 无 | 支持 |
| Update/Delete | 原生数据库操作 | 重写文件 | Merge-on-read |
| Index/约束 | 支持部分 index 和数据库约束 | 无 | 不支持 index/强约束 |
| 最佳场景 | 单应用/单进程分析 | 简单不可变数据集 | 多客户端共享湖仓 |

### 8.2 DuckLake vs Iceberg/Delta/Hudi

| 维度 | DuckLake | Iceberg | Delta Lake | Hudi |
|---|---|---|---|---|
| 元数据核心 | SQL 数据库表 | metadata/manifest files + catalog | transaction log/checkpoint files | timeline + table services |
| 数据文件 | Parquet | 常用 Parquet | Parquet | Parquet |
| 主要优势 | 简洁 SQL 元数据、多表事务、DuckDB 深度集成 | 最广泛的跨引擎开放生态 | Spark/Databricks 生态成熟 | 流式摄取和更新能力强 |
| 目录依赖 | 必须有事务 SQL catalog | 多种 catalog | 可结合多种 catalog | 多种 catalog/服务 |
| 客户端成熟度 | 较新 | 高 | 高 | 中高 |
| 运维复杂度 | 中等 | 中高 | 中高 | 较高 |
| 保守选型条件 | DuckDB 为主、希望轻量共享湖仓 | 多引擎互操作第一 | Spark/Databricks 第一 | CDC/频繁 upsert 第一 |

这不是绝对性能排序。真正的选择条件是：

1. 谁写数据，谁读数据。
2. 是否需要跨引擎。
3. 更新/删除比例。
4. catalog 的可用性和治理要求。
5. 是否接受引入一个事务型 SQL 目录。

---

## 9. 与主流分析引擎的边界

| 引擎 | 主要形态 | DuckDB 相对优势 | 对方相对优势 |
|---|---|---|---|
| Polars | 单机 DataFrame | SQL、事务、目录、复杂查询优化 | Rust DataFrame API、表达式流水线 |
| SQLite | 嵌入式 OLTP | 列式 OLAP、并行、文件分析 | 点查、轻量事务应用 |
| ClickHouse | 服务型列式 OLAP | 嵌入、零服务、本地性 | 高并发、持续摄取、集群和服务能力 |
| Trino | 分布式联邦 SQL | 简单、低启动成本、单机效率 | 多数据源和跨节点并行 |
| Spark | 分布式数据计算 | 低运维、单机效率、交互体验 | 超大规模、容错、分布式 shuffle |
| Athena | 托管 serverless SQL | 本地/嵌入、无每查询服务启动、可控缓存 | 多用户、托管扩展、无需计算资源管理 |
| Redshift/Snowflake | 云数仓 | 无数据导入和服务依赖 | 并发、治理、HA、workload management |

一个实用判断是：

> 如果一台合理规格的机器能在目标 SLA 内完成工作，DuckDB 往往值得优先 PoC；如果问题的本质是并发隔离、持续服务或跨节点扩展，应优先选择服务型/分布式系统。

---

## 10. AWS 参考架构

### 10.1 模式 A：开发者/分析师直接查询 S3

```text
Laptop or EC2
  -> DuckDB
  -> S3 Parquet
```

适合探索、数据验证和小型报表。使用 AWS credential chain，不在 SQL 中硬编码密钥。查询节点应与 S3 同区域，以减少延迟和流量成本。

### 10.2 模式 B：无状态批处理

```text
EventBridge/Step Functions
  -> AWS Batch / ECS task
  -> DuckDB + local NVMe/EBS scratch
  -> S3 curated Parquet
```

每个任务独占一个 DuckDB 进程和临时目录，任务之间通过 S3 文件交换。它保留了 DuckDB 的单机优势，避免多个任务共享写原生数据库文件。

### 10.3 模式 C：嵌入式分析 API

```text
ALB/API Gateway
  -> ECS/EKS/Lambda instances
  -> embedded DuckDB
  -> read-only Parquet/Iceberg/DuckLake on S3
```

适合受控查询模板或固定分析 API。不建议直接接收任意外部 SQL。需要对每实例内存、线程、临时盘、查询超时和并发数设上限。

### 10.4 模式 D：共享 DuckLake

```text
DuckDB clients on ECS/EKS/EC2
  -> Aurora PostgreSQL / RDS PostgreSQL catalog
  -> S3 Parquet data
```

推荐职责：

- PostgreSQL：快照、schema、文件清单、统计信息和冲突协调。
- S3：不可变数据和 delete files。
- DuckDB compute：按需启动的查询与写入进程。
- 定时任务：compaction、rewrite、snapshot expiration、cleanup。

关键设计：

- PostgreSQL 与计算放在相同区域/VPC。
- 目录数据库做 Multi-AZ、备份和 PITR。
- S3 开启合适的版本管理、生命周期和删除保护。
- 把 catalog 恢复点与 S3 数据保留策略一起设计。
- 不要把 DuckDB/SQLite catalog 文件放到 S3 后用于多 writer。

### 10.5 模式 E：只读数据产品

将冻结的 DuckLake catalog 文件和 Parquet 文件发布到 S3/CloudFront，可供 native DuckDB 或 DuckDB-Wasm 通过 HTTPS 查询。

适合公共数据集和静态数据产品。更新通常采用生成新版本后原子切换入口，而不是让消费者参与写入。

### 10.6 模式 F：Quack 轻量远程服务

```text
DuckDB CLI/JDBC/Wasm clients
  -> HTTPS
  -> nginx/Caddy
  -> Quack on EC2
  -> EBS .duckdb file and/or S3/DuckLake
```

官方提供基于 CloudFormation 的 EC2 示例，部署 DuckDB、Quack、nginx 和 Let's Encrypt，并输出连接 URI 与实例 Token。这证明 Quack 是可部署形态，但该模板是示例基础设施，不是 AWS 托管服务。

适合：

- 小团队共享一份 DuckDB 数据库。
- 远程开发、演示和内部分析工具。
- Client 必须保留 DuckDB SQL/类型能力的应用。
- 用一台靠近 S3 数据的 EC2 执行查询，减少向 Client 搬运原始数据。

生产化需补充：

- EC2/进程故障恢复和 Quack 自动重启。
- EBS 快照或数据库级备份。
- Token 轮换、TLS、WAF/安全组和访问审计。
- 查询并发、内存、临时磁盘和取消策略。
- Client/Server 版本升级和协议兼容验证。

Quack 本身不会做多节点查询。若运行多个 Quack Server：

- 每个 Server 使用独立 `.duckdb` 文件时，彼此没有共享事务。
- 多个 Server 共享 DuckLake 时，并发和事务由 DuckLake catalog 协调。
- 负载均衡器不能在不了解会话状态的情况下任意转发 `ATTACH` 后续请求。

---

## 11. 关键风险与误区

### 11.1 把内存外计算等同于无限数据规模

错误。DuckDB 仍受单机 CPU、磁盘容量/吞吐、网络和最大查询时间限制。溢写解决的是内存容量，不解决跨节点扩展。

### 11.2 把直接查询 S3 等同于 Athena

错误。DuckDB 的计算发生在当前机器；Athena 的计算、并发和服务管理由 AWS 提供。DuckDB 节省基础设施和数据加载，应用则承担资源管理。

### 11.3 多个容器共享一个 DuckDB 文件写入

不应作为常规架构。三种模式必须明确区分：

- 单 writer：只有一个容器打开文件写入。
- Quack beta：只有 Quack Server 打开文件，其他容器通过网络间接读写。
- DuckLake + PostgreSQL：多个独立计算进程直接参与共享湖仓事务。

Quack 不是让多个容器共同挂载并写同一文件。

### 11.4 把扩展当成纯 SQL 插件

扩展是进程内原生代码，具有宿主权限。社区扩展和不可信 SQL 都应视为代码执行风险。

### 11.5 用 DuckLake 代替 OLTP 数据库

DuckLake 无 index、PK/FK/unique enforcement，update/delete 采用 merge-on-read，不适合高频点更新和强约束事务系统。

### 11.6 只比较热缓存单查询

DuckDB PoC 应区分：

- 冷/热本地缓存
- 冷/热 S3 metadata
- 首次扩展加载
- 单查询/并发查询
- CPU bound/network bound/spill bound

否则基准结果无法映射到真实架构。

### 11.7 忽视小文件

小文件会同时放大：

- 目录元数据
- S3 请求
- TLS/HTTP latency
- Parquet footer 读取
- DuckLake compaction 成本

文件布局通常比微调 SQL 更重要。

---

## 12. PoC 验证方案

### 12.1 建议验证的五条路径

1. **本地原生 DuckDB**  
   测试应用内嵌、持久化、更新和内存外执行。

2. **DuckDB 直读 S3 Parquet**  
   测试 projection/filter/partition pruning、冷启动和网络行为。

3. **DuckLake + PostgreSQL + S3**  
   测试多 writer、快照、冲突、维护和恢复。

4. **对照组**  
   同一数据和 SQL 对比 Polars、Athena，以及当前生产引擎。

5. **DuckDB + Quack**  
   测试远程查询、`ATTACH` 会话、并发写入、网络开销、Token/TLS、Server 重启和 Client/Server 升级。

### 12.2 数据集设计

至少包含：

- 100 GB 和 1 TB 两个规模
- 窄表与宽表
- 高/低基数列
- 128 MB 左右正常文件组
- 大量 100 KB-1 MB 小文件组
- 有序与无序数据
- 有/无 Hive partition
- 1%、10%、100% 选择率

### 12.3 查询类型

- 全表聚合
- 高选择性过滤
- 大表 Join
- 高基数 Group By
- Window/Sort
- ASOF Join
- 宽表投影
- Update/Delete/Merge
- 并发 append
- 冲突 update

### 12.4 指标

| 类别 | 指标 |
|---|---|
| 时延 | p50/p95/p99、冷/热启动 |
| 资源 | peak RSS、CPU、temp disk、spill bytes |
| 远程 I/O | S3 GET/HEAD 数、传输字节、吞吐 |
| 并发 | 吞吐、排队时间、冲突/重试率 |
| DuckLake | catalog latency、snapshot commit、文件数、delete file 数 |
| Quack | RPC 往返、首连/TLS、连接复用、结果传输、Server 排队、Client/Server 版本 |
| 成本 | compute time、S3 request、data transfer、catalog |
| 稳定性 | OOM、取消、失败恢复、重跑幂等性 |

### 12.5 通过标准示例

可按业务调整：

- 单查询在目标规格机器内达到 SLA。
- `peak RSS` 不突破容器限制的 70%-80%。
- temp disk 有 2 倍以上最坏 spill 余量。
- S3 查询实际传输量接近所需列/row group，而非全量文件。
- 8-16 并发下没有不可接受的尾延迟恶化。
- DuckLake 并发 append 可自动重试完成。
- Quack 在目标并发下能够取消查询、限制资源，并在 Server 重启后按预期恢复持久状态。
- 目录数据库故障时不会产生不可恢复的已提交状态。
- compaction、expire 和 cleanup 在规定窗口内完成。
- catalog PITR + S3 保留能够恢复到指定 snapshot。

---

## 13. 选型决策树

```text
是否需要 SQL 分析？
  |
  +-- 否 -> 选择更直接的程序库/DataFrame
  |
  +-- 是
      |
      +-- 单机能否在 SLA 内完成？
      |   |
      |   +-- 否 -> Spark/Trino/云数仓/分布式 OLAP
      |   |
      |   +-- 是
      |       |
      |       +-- 是否需要大量并发用户和服务级隔离？
      |       |   |
      |       |   +-- 是 -> 服务型分析数据库或托管服务
      |       |   |
      |       |   +-- 否 -> DuckDB 候选
      |       |
      |       +-- 是否需要多个独立计算实例直接共享数据事务？
      |           |
      |           +-- 否
      |           |   |
      |           |   +-- 本地/进程内访问 -> DuckDB 原生文件或直接查询 Parquet
      |           |   |
      |           |   +-- 少量受控 Client 远程访问同一实例 -> Quack（当前 beta）
      |           |
      |           +-- 是
      |               |
      |               +-- 跨引擎生态优先 -> Iceberg/Delta/Hudi
      |               |
      |               +-- DuckDB 为主且希望轻量 -> DuckLake + PostgreSQL
```

---

## 14. 采用建议

### 14.1 DuckDB 的合理技术定位

应把 DuckDB 纳入以下技术雷达位置：

- **默认的本地 SQL 分析引擎**
- **Python/应用中的嵌入式 OLAP 组件**
- **中等规模单机数据转换引擎**
- **Parquet/S3 的轻量查询层**
- **数据流水线和测试的快速执行环境**
- **通过 Quack 暴露的轻量远程分析服务（当前处于试验阶段）**

不应默认定位为：

- OLTP 主库
- 分布式大数据平台
- 多租户数据库服务
- 共享文件式高可用数据库

### 14.2 DuckLake 的合理技术定位

DuckLake 值得 PoC 的条件：

- 主要计算引擎是 DuckDB。
- 希望把数据放到对象存储。
- 需要多客户端共享读写、time travel 和 schema evolution。
- 团队可以运营 PostgreSQL catalog 和文件维护任务。
- 对 Iceberg/Delta 的广泛跨引擎生态不是硬性要求。

应暂缓 DuckLake 的条件：

- 必须由大量异构引擎完整读写。
- 强依赖成熟治理平台、catalog federation 和既有 Iceberg 工具链。
- 表以高频 update/delete 为主。
- 需要主键、外键、唯一性和低延迟点查。
- 无法承担 compaction、snapshot retention 和双层备份运维。

### 14.3 推荐采用路径

1. 先用 DuckDB 直读现有 S3 Parquet，验证核心查询和单机边界。
2. 对重复查询或需要更新的数据，评估原生 DuckDB 文件与 DuckLake 的差异。
3. 只有在需要少量受控 Client 远程访问同一实例时评估 Quack，并明确由唯一 Server 进程持有原生文件。
4. 只有在出现多个独立 writer、共享 catalog、time travel 等明确需求时引入 DuckLake。
5. 同时保留 Athena/Trino/Spark 作为超过单机边界或需要高并发服务时的升级路径。
6. 用真实业务数据验证小文件、冷缓存、并发和失败恢复，不仅验证 SQL 功能。

---

## 15. 主要资料来源

### DuckDB

1. [DuckDB GitHub repository](https://github.com/duckdb/duckdb)
2. [DuckDB v1.5.5 release](https://github.com/duckdb/duckdb/releases/tag/v1.5.5)
3. [DuckDB documentation](https://duckdb.org/docs/current/)
4. [Concurrency](https://duckdb.org/docs/current/connect/concurrency.html)
5. [Quack Remote Protocol](https://duckdb.org/docs/current/quack/overview.html)
6. [Quack Security](https://duckdb.org/docs/current/quack/security.html)
7. [Deploying Quack](https://duckdb.org/docs/current/quack/setup/deployment.html)
8. [Quack FAQ](https://duckdb.org/quack/faq.html)
9. [Quack core extension status](https://duckdb.org/docs/current/core_extensions/quack.html)
10. [Tuning Workloads](https://duckdb.org/docs/stable/guides/performance/how_to_tune_workloads.html)
11. [Reading and Writing Parquet](https://duckdb.org/docs/stable/data/parquet/overview.html)
12. [Hive Partitioning](https://duckdb.org/docs/stable/data/partitioning/hive_partitioning.html)
13. [Friendly SQL](https://duckdb.org/docs/stable/sql/dialect/friendly_sql)
14. [Securing DuckDB](https://duckdb.org/docs/current/operations_manual/securing_duckdb/overview.html)
15. [Securing Extensions](https://duckdb.org/docs/current/operations_manual/securing_duckdb/securing_extensions.html)
16. [Parallel Grouped Aggregation](https://duckdb.org/2022/03/07/aggregate-hashtable.html)
17. [Redesigning DuckDB's Sort, Again](https://duckdb.org/2025/09/24/sorting-again.html)

### DuckLake

18. [DuckLake v1.0 production-readiness announcement](https://ducklake.select/2026/04/13/ducklake-10/)
19. [DuckLake stable documentation](https://ducklake.select/docs/stable/)
20. [DuckLake specification introduction](https://ducklake.select/docs/stable/specification/introduction)
21. [Choosing a Catalog Database](https://ducklake.select/docs/stable/duckdb/usage/choosing_a_catalog_database)
22. [Choosing Storage](https://ducklake.select/docs/stable/duckdb/usage/choosing_storage)
23. [Transactions](https://ducklake.select/docs/stable/duckdb/advanced_features/transactions.html)
24. [Conflict Resolution](https://ducklake.select/docs/stable/duckdb/advanced_features/conflict_resolution)
25. [Schema Evolution](https://ducklake.select/docs/stable/duckdb/usage/schema_evolution)
26. [Time Travel](https://ducklake.select/docs/stable/duckdb/usage/time_travel)
27. [Partitioning](https://ducklake.select/docs/stable/duckdb/advanced_features/partitioning)
28. [Unsupported Features](https://ducklake.select/docs/stable/duckdb/unsupported_features)
29. [Recommended Maintenance](https://ducklake.select/docs/stable/duckdb/maintenance/recommended_maintenance)
30. [Backup and Recovery](https://ducklake.select/docs/stable/duckdb/guides/backups_and_recovery)
31. [Access Control](https://ducklake.select/docs/stable/duckdb/guides/access_control)
32. [DuckLake: SQL as a Lakehouse Format](https://duckdb.org/2025/05/27/ducklake)
