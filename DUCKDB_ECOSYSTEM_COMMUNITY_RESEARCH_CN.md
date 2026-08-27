# DuckDB / DuckLake 社区实践、生态表现与厂商动作深度调研

> 调研基线：2026-08-27  
> 调研对象：DuckDB、DuckLake、基于 DuckDB 的产品与工程实践、云厂商及 ISV 动作  
> 配套文档：[DuckDB 核心能力与核心使用场景深度调研](./DUCKDB_DEEP_RESEARCH_CN.md)  
> 说明：本文重点回答“社区是否成熟、哪些场景已经过生产验证、厂商实际做了什么”，不重复展开 DuckDB 内核原理。

---

## 1. 执行摘要

### 1.1 先给结论

1. **DuckDB 已经形成成熟且有辨识度的工程社区，但成熟的是“嵌入式 OLAP 运行时”这一产品形态。**  
   Watershed、Okta、Hex、Mode、Evidence、Rill 等案例覆盖了应用内分析、Serverless 数据处理、数据产品运行时、浏览器分析和本地优先 BI。社区并非只有 Notebook 演示，已经有多年运行、每日数万到百万级调用、故障治理和资源隔离方面的一手工程材料。

2. **不能把 DuckDB 的成熟度直接等价成分布式数据库或云数仓成熟度。**  
   DuckDB 最成熟的模式是“一个进程、一台机器、一个任务或一个用户拥有自己的执行引擎”。高并发共享服务、跨节点扩展、多租户资源治理和高可用并不是开源 DuckDB 内核直接提供的完整能力。

3. **DuckLake v1.0 的规范与 DuckDB 参考实现已被官方定义为 production-ready，但跨引擎生态仍处早期。**  
   DuckDB 扩展已经有向后兼容承诺；DataFusion、Spark、Trino、PostgreSQL 实现均已出现，但项目年龄、功能覆盖、维护主体和生产证据明显不及 Iceberg。应把“格式成熟度”和“生态成熟度”分开评价。

4. **2026 年最大的战略事件是 AWS 签署收购 DuckLabs 的最终协议。**  
   截至本报告日期，交易仍待惯常交割条件完成；AWS 收购的是公司和团队，不是 DuckDB 开源项目。DuckDB 仍由独立 DuckDB Foundation 监督并采用 MIT 许可证。该事件显著提高了 DuckDB 的战略确定性，同时也带来核心团队集中度和未来路线中立性的观察项。

5. **云厂商的动作分成三条路线，不能混为一谈。**
   - **直接战略投入或产品化**：AWS、阿里云、腾讯云、Snowflake。
   - **通过 Iceberg/Delta/Open Catalog 正式互操作**：Databricks、Snowflake Polaris、Cloudflare R2、AWS S3 Tables。
   - **教程或第三方 Marketplace 镜像**：只能说明“能运行”，不能说明云厂商采用或提供支持。

6. **国内云厂商的产品化程度高于表面认知。**  
   阿里云已经在 RDS MySQL 和 RDS PostgreSQL 提供 DuckDB 分析实例或加速能力；腾讯云 PostgreSQL 提供基于 DuckDB 的 `pg_lake` 列存表和同步表。这些属于正式产品文档中的数据库能力，不是社区教程。

7. **DuckDB 正从工具演进为通用分析组件。**  
   最明显的扩张方向是 PostgreSQL/MySQL HTAP 加速、开放湖仓客户端、每用户/每任务 Serverless 执行、Agentic BI/MCP 数据访问，以及向量和多模态数据处理。但这些方向的成熟度差异很大。

8. **Quack 补上了 DuckDB 官方 Client-Server 交互层，但目前补齐的是“远程访问能力”，不是完整数据库服务控制面。**  
   Quack 让一个 DuckDB 实例通过 HTTP(S) 服务于其他 DuckDB Client，并可把多个 Client 的写入集中到唯一 Server 进程。它自 v1.5.3 起作为 core extension 发布，但仍处 beta/experimental；高可用、统一身份、多租户治理、备份和自动扩缩容仍需自行建设或使用 MotherDuck 等托管服务。

### 1.2 总体成熟度判断

| 领域 | 当前成熟度 | 判断 |
|---|---:|---|
| 本地交互分析、Notebook、数据科学 | 高 | 已成为事实标准候选 |
| 应用内嵌分析和数据产品运行时 | 高 | 多个长期生产案例，架构价值清晰 |
| Parquet/对象存储按需分析 | 高 | 核心能力成熟，工程效果取决于文件布局和网络 |
| 单机 ETL、Serverless 批处理 | 中高 | 已有大规模实践，但需自行完成资源治理和重试 |
| 浏览器内分析（Wasm） | 中高 | 产品案例成熟，受浏览器内存和数据传输约束 |
| PostgreSQL/MySQL HTAP 加速 | 中高 | 国内外厂商快速产品化，仍需看各实现语义边界 |
| DuckDB + Iceberg/开放 Catalog | 中高 | 主流平台已有正式互操作，但写入和治理能力不完全一致 |
| DuckLake + DuckDB | 中 | v1.0 已面向生产，运维和案例仍需积累 |
| DuckLake 多引擎湖仓 | 低到中 | 实现已经出现，生态和生产验证尚早 |
| Quack 远程 Client-Server | 早期/Beta | 官方路径已形成，可部署；协议和控制面仍在成熟 |
| Agentic BI / MCP 数据访问 | 早期 | 方向活跃，安全、可观测和语义层尚未定型 |
| 分布式超大规模执行 | 低 | 不是开源 DuckDB 的目标形态 |

---

## 2. 调研方法与证据分级

### 2.1 证据优先级

本文按以下等级判断“厂商或社区是否真的在做”：

| 等级 | 定义 | 可得出的结论 |
|---|---|---|
| A：战略或原生产品 | 并购、正式云产品、数据库内核采用、生产系统一手披露 | 厂商已经投入产品或核心工程资源 |
| B：正式支持的产品互操作 | 官方产品文档、受支持连接器、公开预览或 GA 功能 | 厂商认可并维护互操作路径 |
| C：持续维护的开源集成 | 活跃仓库、官方或社区扩展、明确维护主体 | 可进入 PoC，支持边界需单独确认 |
| D：教程、Demo、第三方镜像 | 博客教程、样例代码、Marketplace 第三方 AMI | 只能证明技术可行，不能证明产品采用 |

成熟实践优先采用以下材料：

1. 使用方自己的工程博客、会议演讲和架构材料。
2. 云厂商产品文档、发布公告和代码仓库。
3. DuckDB / DuckLake 官方文档与官方会议材料。
4. ISV 官网和产品文档。
5. 二手整理只用于发现线索，不单独支撑关键结论。

### 2.2 需要避免的三个误判

**误判一：支持 DuckDB 查询 Iceberg，就等于支持 DuckLake。**  
不是。Iceberg 和 DuckLake 是不同格式。Databricks Unity Catalog、Snowflake Polaris、AWS S3 Tables、Cloudflare R2 Data Catalog 的多数动作，是让 DuckDB 通过 Iceberg REST Catalog 或开放 API 访问数据。

**误判二：云上存在 DuckDB AMI，就等于云厂商推出 DuckDB 服务。**  
不是。Marketplace 中很多镜像由第三方发布。只有云厂商自己的产品文档、控制台能力或服务公告才计入 A/B 级动作。

**误判三：GitHub Star 很高，就等于生产成熟。**  
Star 反映关注度。成熟度还需要版本节奏、维护者结构、兼容承诺、生产案例、故障治理和供应商支持等证据。

---

## 3. DuckDB 社区表现

### 3.1 可量化社区信号

截至 2026-08-27：

| 指标 | DuckDB | DuckLake | 解读 |
|---|---:|---:|---|
| GitHub Star | 40,692 | 2,942 | DuckDB 已进入主流数据基础设施项目的关注量级；DuckLake 在约 18 个月内增长较快 |
| Fork | 3,625 | 241 | 有实际二次开发和研究活动 |
| Open issues / PR 合计口径 | 794 | 177 | 活跃项目的工作队列；不能单独解读为质量差 |
| 最近代码推送 | 2026-08-26 | 2026-08-26 | 调研日前一天仍在活跃开发 |
| 许可证 | MIT | MIT | 便于嵌入、再分发和商业产品采用 |
| `@duckdb/duckdb-wasm` 月下载 | 1,914,991 | 不适用 | 浏览器和 JavaScript 生态已有可观使用规模 |

数据来源：

- [duckdb/duckdb GitHub API](https://api.github.com/repos/duckdb/duckdb)
- [duckdb/ducklake GitHub API](https://api.github.com/repos/duckdb/ducklake)
- [npm download API: @duckdb/duckdb-wasm](https://api.npmjs.org/downloads/point/last-month/%40duckdb%2Fduckdb-wasm)

官方在达到 40k Star 时还披露了每月超过 800 万独立网站访问和累计超过 2 PB 的扩展下载流量。这是项目方自报的流量指标，适合观察采用趋势，不应作为生产质量证明：[DuckDB Reaches 40k Stars on GitHub](https://duckdb.org/2026/08/05/github-40k-stars.html)。

### 3.2 版本和贡献节奏

- DuckDB 从 2018 年开始公开开发，已经跨过“新项目”阶段。
- v1.5 距 v1.4 累计超过 6,500 次提交、接近 100 名贡献者，说明开发并非只有少数维护者提交小修复：[Announcing DuckDB 1.5.0](https://www.duckdb.org/2026/03/09/announcing-duckdb-150)。
- 项目既有快速版本，也开始提供 LTS 版本窗口。这对 ISV 嵌入、企业升级和扩展兼容尤其重要。
- 扩展机制使云文件系统、表格式、搜索、空间、数据库连接器等能力可以独立演进，但也引入二进制兼容、供应链安全和版本覆盖差异。

官方开发者会议材料显示，2026 年 1 月约有 32 个核心扩展和 145 个社区扩展；下载量是项目方统计口径，不代表独立用户数：[DuckDB Extensions – State of the Union](https://blobs.duckdb.org/events/duckdb-developer-meeting-1/duckdb-extensions-sam-ansmink.pdf)。

### 3.3 社区的结构性优势

**一是嵌入面非常宽。**  
Python、R、Java、Node.js、Go、Rust、C/C++、Wasm、CLI 都可以把同一 SQL 引擎带入应用。社区因此不是只围绕“数据库管理员”，而是同时覆盖数据工程师、分析师、应用开发者和数据产品团队。

**二是开放格式带来自然分发。**  
DuckDB 不要求先建设服务端数据库，安装包或依赖库即可开始查询 Parquet、CSV、JSON、Arrow、Iceberg 和对象存储。试用成本极低，容易进入开发者工作流。

**三是使用者能够把它当组件，而不是平台。**  
Mode、Hex、Evidence、Rill、Watershed 的共同点不是“把整个数据平台迁移到 DuckDB”，而是在明确边界内替换一个执行层、缓存层或分析运行时。这降低了采用风险。

**四是社区材料偏工程化。**  
DuckDB 官方博客和 DuckCon 经常讨论排序、哈希聚合、扩展安全、文件格式、外部扫描和具体生产架构，信号质量高于仅发布功能营销文章的项目。

### 3.4 社区的结构性风险

1. **核心技术领导集中。**  
   创始人和核心团队仍对技术路线有很强影响。AWS 公告称，交易完成后 DuckLabs 团队将加入 AWS；在此之前和之后，社区都需要持续观察治理透明度、路线优先级和其他云厂商的参与意愿。

2. **Foundation 独立不等于开发资源完全分散。**  
   DuckDB Foundation 持有和监督开源项目、MIT 许可证提供法律与使用保障，但主要全职工程资源的雇佣关系仍可能集中。

3. **社区扩展成熟度不一致。**  
   核心扩展与社区扩展在构建、签名、平台覆盖、版本节奏和故障支持上不同。企业采用必须给每个扩展单独建清单。

4. **进程内模型把责任交给宿主应用。**  
   资源隔离、连接生命周期、SQL 权限、扩展白名单、临时磁盘和崩溃恢复都不再由独立数据库服务自动兜底。

5. **“单机很快”容易造成规模误读。**  
   数据能够从对象存储流式读取或 spill 到磁盘，不代表单个查询可以无限扩展，也不代表远程小文件问题消失。

### 3.5 社区表现结论

综合判断：

> DuckDB 社区已达到“主流、活跃、有长期生产证据”的水平；其成熟边界是嵌入式和单节点分析。DuckLake 社区增长快，但尚处从参考实现走向多引擎、可运营生态的阶段。

---

## 4. 成熟和权威的工程实践

### 4.1 案例总览

| 组织 | 使用方式 | 可验证规模或结果 | 证据强度 |
|---|---|---|---:|
| Watershed | 独立 DuckDB 查询服务读取 Parquet，计算碳足迹 | 2023 年约 7.5 万查询/日；后续披露超过 10 万请求/日，过去半年计算成本下降 25%，生成成功率保持 95%+ | A |
| Okta | Serverless 嵌入式 OLAP，用于安全数据标准化、富化和分析 | 官方演讲主题为处理万亿级记录；外部复盘披露约 100 万次 DuckDB Lambda 调用/日，具体数字宜视为演讲复盘口径 | A/B |
| Mode | 用 DuckDB 替换 VoltDB，承载结果集写入和可视化探索 | 目标包含每秒数百次表写入、百万行复杂 Pivot 在数百毫秒完成；迁移对用户无感 | A |
| Hex | DuckDB + Arrow + S3 支撑 Lazy DataFrames | 数据集可到数亿行；多个实际项目运行时间缩短 5–10 倍 | A |
| Evidence | DuckDB-Wasm 驱动浏览器内 BI | 把多个数据源构建成 Parquet，在浏览器本地执行 SQL | B |
| Rill | DuckDB 驱动本地 BI-as-code 开发体验 | SQL/YAML 项目本地执行，并与云端或 MotherDuck 路径衔接 | B |
| Spotify | 为用户听歌历史构建面向 Agent 的 SQL 访问层 | 源数据达到 PB 级，组合近期数据与预计算视图；来自 DuckCon 一手演讲 | B |
| Observable | 浏览器、Notebook 和 Dashboard 中使用 DuckDB | 演示百万行交互分析，同时明确浏览器高频交互的性能边界 | B |
| Fivetran | 数据湖目标和本地湖仓查询路径 | 用 DuckDB 查询 Iceberg/Delta 数据；官方测试也指出大规模多核下商业分布式系统更有优势 | B |

### 4.2 Watershed：最完整的长期生产样本

Watershed 的碳核算产品需要对每个客户的碳足迹数据执行灵活聚合。其早期 PostgreSQL 方案存在大表、迁移困难和任意分析查询扩展性问题，后续将客户数据存为 Parquet，由独立的 DuckDB 服务执行查询。

2023 年 DuckCon 材料披露：

- 约 12% 客户的足迹数据超过 100 万行。
- 最大客户超过 1,500 万行，对应约 750 MB Parquet。
- 与大量索引的 PostgreSQL 相比约快 10 倍。
- P99 数据规模上的查询约为数百毫秒。
- 每日约 75,000 次 DuckDB 服务查询。

后续工程博客显示系统继续扩大：

- 每日超过 100,000 次 DuckDB 请求。
- 请求耗时从毫秒级到 30 分钟。
- 多数客户足迹小于 100 GB 未压缩数据。
- 通过内存档位、资源估算、查询画像和路由，把不同任务分配到约 30 GB 或 180 GB 内存的实例。
- 最近六个月将 DuckDB 计算支出降低 25%，同时保持 95% 以上的生成成功率。

权威材料：

- [How Watershed uses DuckDB to reliably compute customer footprints](https://watershed.com/de/blog/how-watershed-uses-duckdb-to-reliably-compute-customer-footprints)
- [DuckCon #3: Using DuckDB at Watershed](https://blobs.duckdb.org/events/duckcon3/jessica-zhu-watershed.pdf)

**为什么这个案例重要：**

- 它不是单次 Benchmark，而是多年生产运行。
- 披露了资源分档、失败率和成本，不只展示查询速度。
- 它证明 DuckDB 可以作为服务内部的执行器，但服务治理仍由 Watershed 自己构建。

### 4.3 Okta：Serverless 小引擎处理大数据湖

Okta Defensive Cyber Operations 团队把嵌入式 OLAP 用于安全数据湖中的文件规范化、富化、元数据生成、信号提取、历史分析和模型训练。

其架构思想是：

```text
S3 数据湖
  -> 按文件或任务启动短生命周期计算
  -> 每个函数/容器内嵌 DuckDB
  -> 结果继续写回开放文件格式
```

这类架构把一个“大集群”拆成大量隔离的小型数据库执行器，按任务动态分配资源。官方 Data Council 演讲明确以“Processing Trillions of Records with Tiny Serverless Databases”为主题；约 100 万次 Lambda 调用/日等数字来自演讲复盘，应与官方幻灯片本身区分。

材料：

- [Okta Data Council 2024 slides](https://2575662.fs1.hubspotusercontent-na1.net/hubfs/2575662/Data%20Council/Data_Eng_Infra_1.2_Jake_Thomas_Processing_Trillions_Of_Records_With_Tiny_Serverless_Databases%20%281%29.pdf)
- [Okta's multi-engine data stack – talk recap](https://juhache.substack.com/p/oktas-multi-engine-data-stack)

**适用启示：**

- 最适合文件级天然可分片、任务独立、允许最终写回对象存储的流水线。
- 不是用 DuckDB 直接完成跨任务的全局分布式协调。
- Lambda 临时磁盘、内存、超时、重复执行和坏文件隔离必须由平台层治理。

### 4.4 Mode：替换产品内部分析引擎

Mode 将可视化探索所用的内存数据引擎从 VoltDB 迁移到 DuckDB。场景要求高频写入查询结果，并对百万行结果执行复杂 Pivot 和交互。

公开材料中的关键目标包括：

- 峰值每秒数百次表写入。
- 对数百万行数据的复杂 Pivot 在数百毫秒完成。
- 迁移过程对用户零停机、无感知。

材料：[How we switched our in-memory data engine to DuckDB](https://mode.com/blog/how-we-switched-in-memory-data-engine-to-duck-db-to-boost-visual-data-exploration-speed/)

**适用启示：** DuckDB 不只是数据工程 CLI，也适合作为商业 SaaS 内部不可见的查询组件。此时真正的产品边界由上层服务提供，DuckDB 负责单会话或单结果集分析。

### 4.5 Hex：DataFrame 和对象存储之间的懒执行层

Hex 的 Lazy DataFrames 使用 DuckDB、Arrow 和 S3，让用户在不把全部数据加载到客户端内存的情况下进行 DataFrame 操作。

官方案例披露：

- 可处理数亿行数据集。
- 多个实际项目获得 5–10 倍总运行时间改善。
- 示例包括 12 秒降到 1 秒、15–20 秒降到 3–5 秒、超过 2 分钟降到 30 秒以内。

材料：[Introducing Lazy DataFrames](https://hex.tech/blog/lazy-dataframes/)

**适用启示：** DuckDB 的重要价值不是单个 SQL Benchmark，而是把 DataFrame 操作编译为可下推、可流式和可延迟执行的计划，减少 Python 对象和不必要的数据搬运。

### 4.6 Evidence 和 Observable：浏览器是独立成熟分支

Evidence 使用 DuckDB-Wasm 构建 Universal SQL：

```text
数据仓库 / SaaS 数据源
  -> 构建阶段查询和缓存
  -> 生成 Parquet
  -> 浏览器下载所需数据
  -> DuckDB-Wasm 本地 SQL 和交互
```

这使浏览器承担过滤、聚合和交互，降低每次交互回源数据库的延迟和成本。

- [Why we built Universal SQL](https://evidence.dev/blog/why-we-built-usql)
- [Evidence DuckDB data source](https://docs.evidence.dev/core-concepts/data-sources/duckdb)

Observable 则在 Notebook、Data Loader 和 Dashboard 中使用 DuckDB，并在 DuckCon 材料中同时展示了百万行交互能力与浏览器 60 FPS 交互可能带来的过载风险：

- [DuckCon #5](https://www.duckdb.org/events/2024/08/15/duckcon5/)
- [A Duck for Your Dashboard](https://blobs.duckdb.org/events/duckcon5/robert-kosara-a-duck-for-your-dashboard.pdf)

**边界：**

- 浏览器内计算避免了服务端逐次查询，但数据仍需传到浏览器。
- Wasm 内存、移动设备能力、首屏下载、敏感数据下发和缓存失效是主要约束。
- 适合发布已裁剪或已聚合的数据集，不适合把整个企业数据湖直接下发给终端。

### 4.7 Rill：本地优先 BI-as-code

Rill Developer 把 DuckDB 嵌入本地开发工具，分析工程师用 SQL 和 YAML 构建模型与 Dashboard。其价值在于：

- 无需先部署数据库即可本地运行。
- 源数据、模型和 Dashboard 可以代码化。
- 本地 DuckDB 与云端执行路径保持相似开发体验。
- 可通过 MotherDuck 等方案扩展共享和托管能力。

材料：

- [Why we built Rill with DuckDB](https://rilldata.com/blog/why-we-built-rill-with-duckdb)
- [Fast DuckDB-powered dashboards](https://www.rilldata.com/blog/fast-duckdb-powered-dashboards)

### 4.8 Spotify：Agentic 数据访问的新案例

Spotify 在 DuckCon #7 分享了面向用户听歌历史构建 SQL 访问层的实践。其目标不是让 Agent 随意扫描 PB 级源表，而是把近期行为事实和预计算视图组织成低延迟、受约束的数据接口。

- [DuckCon #7 agenda](https://www.duckdb.org/events/2026/06/24/duckcon7/)
- [SQL-based agentic access to listening history](https://blobs.duckdb.org/events/duckcon7/kian-mehrabani-spotify-sql-agentic-access.pdf)

**成熟度判断：** 这是高价值的一手方向性案例，但公开材料还不足以证明 Agentic BI 已形成通用生产范式。权限、语义、查询预算、结果可解释性和 Prompt Injection 仍需由上层解决。

### 4.9 Fivetran：有价值的反例和边界说明

Fivetran 的测试结论比单纯宣传更有参考价值：

- DuckDB 在小中型数据上有很强价格性能和易用性。
- 随数据量、核数和并发提高，专用商业系统或分布式系统可以获得更好的扩展。
- 测试作者披露其为 MotherDuck 天使投资人，阅读结果时应考虑利益关系。

材料：[How fast is DuckDB, really?](https://www.fivetran.com/blog/how-fast-is-duckdb-really)

Fivetran 也提供 Managed Data Lake、Polaris Catalog、Iceberg/Delta 与 DuckDB 的本地查询教程，但这主要是开放格式互操作，不代表 Fivetran 把自身平台全部迁移到 DuckDB：

- [Run local AI queries on your data lake with DuckDB and Claude](https://www.fivetran.com/blog/run-local-ai-queries-on-your-data-lake-with-duckdb-and-claude)
- [Apache Polaris Catalog in Fivetran Managed Data Lake](https://www.fivetran.com/blog/getting-started-with-apache-polaris-catalog-in-fivetrans-managed-data-lake-service)

---

## 5. 社区场景成熟度

### 5.1 已经成熟的场景

#### 场景 A：本地、Notebook 和交互式分析

成熟原因：

- 零服务部署。
- Python/R/CLI 接口稳定。
- 直接消费 DataFrame、Arrow 和文件。
- SQL 功能完整，支持超内存计算。
- 能在开发机和 CI 中复现。

典型上限不是固定数据量，而是单机 CPU、内存、临时磁盘和可接受响应时间。

#### 场景 B：应用内嵌分析

成熟原因：

- Mode、Hex、Evidence、Rill、Watershed 已给出不同形态的一手案例。
- 应用可以为每个用户、项目、结果集或任务分配独立 DuckDB。
- 不需要把中间数据通过网络传给独立数据库服务。

工程关键是明确所有权：

```text
one user / one task / one result set
  -> one DuckDB execution context
  -> bounded CPU, memory and temporary storage
```

#### 场景 C：Parquet 和对象存储按需查询

成熟原因：

- 列裁剪、谓词下推、分区裁剪和远程文件读取路径成熟。
- S3、Azure Blob、GCS 及兼容对象存储均有集成方式。
- 可以只把结果物化到本地或写回数据湖。

主要风险不是 SQL 引擎，而是：

- 过多小文件。
- 跨区域传输。
- 高延迟对象请求。
- 缺少 catalog 统计信息。
- 重复扫描导致成本不可控。

#### 场景 D：单机 ETL 和 Serverless 文件处理

适合按文件、分区或客户天然拆分的任务。Okta 和 Watershed 证明了该模型可以做到很大总吞吐，但总体扩展来自任务级并行，不是 DuckDB 单查询分布式执行。

#### 场景 E：本地开发、测试和 CI

DuckDB 可以替代重量级测试数仓，用真实 SQL 和 Parquet 样本验证：

- 模型逻辑。
- 数据质量规则。
- Schema 演化。
- 小规模回归数据。
- dbt 模型和 Python 管道。

这是采用成本最低、风险最小的切入点。

### 5.2 快速成熟中的场景

#### 场景 F：PostgreSQL / MySQL 分析加速

这一方向已经从社区 `pg_duckdb` 扩展进入云数据库产品：

- Snowflake `pg_lake`。
- 阿里云 RDS PostgreSQL `rds_duckdb`。
- 阿里云 RDS MySQL DuckDB 分析主实例和只读实例。
- 腾讯云 PostgreSQL `pg_lake`。

共同架构是保留 OLTP 接口和行存语义，把适合的扫描、聚合、连接或镜像表路由到 DuckDB 列式执行。

需要逐产品验证：

- 数据同步延迟。
- 支持的 SQL 和数据类型。
- DML/DDL 语义。
- 查询回退机制。
- 事务一致性。
- 扩展版本与原生 DuckDB 的差异。

#### 场景 G：开放 Catalog / Iceberg 客户端

DuckDB 已成为开放湖仓厂商验证互操作时常用的轻量客户端。AWS S3 Tables、Databricks Unity Catalog、Snowflake Polaris、Cloudflare R2 Data Catalog 都有正式材料。

这个趋势说明：

> DuckDB 正在扮演“湖仓的本地 SQL 客户端”，但数据格式多数仍是 Iceberg 或 Delta，不是 DuckLake。

#### 场景 H：每用户或每 Agent 独立执行器

MotherDuck 的 Hypertenancy、Spotify 的 Agent 数据访问和多个 MCP Demo 共同指向：

```text
共享对象存储 / Catalog
  + 每用户或每 Agent 的小型 DuckDB
  + 查询预算和权限代理
```

该架构很适合 Agent 的突发、低并发、上下文局部查询。但目前更像架构趋势，尚未形成成熟的统一控制面标准。

### 5.3 Quack：官方远程交互和可部署形态

Quack 于 2026-05-12 发布 beta，并从 DuckDB v1.5.3 起作为 core extension 分发。它让两个 DuckDB 进程分别成为 Client 和 Server：

```text
DuckDB client + Quack
        |
        | HTTP(S), quack: URI
        v
DuckDB server + Quack
        |
        +-- native .duckdb
        +-- memory tables
        +-- Parquet/S3
        +-- Iceberg/DuckLake/other attached catalogs
```

它的生态意义在于，DuckDB 第一次拥有核心团队维护的正式 Client-Server 路径，而不再只有：

- 应用内嵌 DuckDB。
- 第三方 Arrow Flight/HTTP wrapper。
- MotherDuck 自有远程协议和托管服务。

#### Quack 的能力边界

| 维度 | Quack 当前能力 | 不应推导出的结论 |
|---|---|---|
| 实例形态 | 把已有 DuckDB 实例暴露为 Server | 不是新的 `DatabaseInstance` 类型 |
| 多客户端 | 多个 DuckDB Client 可远程查询和写入 | 不是多个进程直接共享写同一文件 |
| 会话 | `quack_query` 无状态；`ATTACH` 可保持 Server 侧连接状态 | 负载均衡不能忽略会话粘性 |
| 协议 | HTTP request/response + DuckDB 内部序列化 | 不是 PostgreSQL/MySQL wire protocol |
| 执行 | SQL 主要在 Server 机器执行 | 不是跨多个 Server 的分布式查询 |
| 安全 | Token、localhost 默认绑定、认证/授权 callback | 不是完整 IAM、RBAC 或租户控制面 |
| 部署 | 可在 VM/容器运行，官方提供 EC2 CloudFormation 示例 | 不是 AWS 托管数据库服务 |

#### Quack、DuckLake 与 MotherDuck

| 组件 | 本质 | 主要解决的问题 | 当前成熟度 |
|---|---|---|---:|
| Embedded DuckDB | 进程内分析引擎 | 本地或应用内计算 | 高 |
| Quack | DuckDB-to-DuckDB RPC 和 Server facade | 远程访问同一 DuckDB 实例 | Beta |
| DuckLake | 开放湖仓格式和事务 catalog | 多计算实例共享对象存储数据 | v1.0 主路径中等，多引擎仍早期 |
| MotherDuck | 商业托管 DuckDB 服务 | 身份、共享、持久化、多租户和运营控制面 | 商业产品 |

Quack 可以暴露已挂载 DuckLake 的 Server，也可以让 DuckDB 通过 Quack 使用远端 catalog；两者是协议层和数据层的组合，不是替代关系。

#### 社区成熟度判断

积极信号：

- 由 DuckDB 核心团队开发并进入 core repository。
- CLI、JDBC 间接访问和 DuckDB-Wasm 等 Client 具有统一 DuckDB 语义。
- 官方提供协议文档、安全说明、反向代理和 EC2 部署模板。
- 使用 DuckDB 内部序列化，嵌套类型无需绕行通用交换格式。

风险信号：

- 截至调研日仍为 beta/experimental，协议、函数、配置和默认值可能破坏性变化。
- 官方计划随 DuckDB v2.0 稳定，但计划不等于已经形成兼容承诺。
- 公开第三方长期生产案例很少，证据强度远低于 Embedded DuckDB。
- Server 原生仅提供 HTTP，公网 TLS 依赖 nginx/Caddy 等代理。
- 默认 Token 和 callback 不能替代企业用户目录、细粒度授权和审计平台。
- 单 Server 仍是计算、内存、文件所有权和故障域边界。

结论：

> Quack 已经补齐 DuckDB 产品版图中的官方远程协议，但当前应放在 Assess/受控 PoC，而不是与成熟 Client-Server 数据库或 MotherDuck 的完整服务能力等价。

权威资料：

- [Quack announcement and overview](https://duckdb.org/quack)
- [Quack protocol documentation](https://www.duckdb.org/docs/current/quack/overview.html)
- [Quack security](https://www.duckdb.org/docs/current/quack/security.html)
- [Deploying Quack](https://www.duckdb.org/docs/current/quack/setup/deployment.html)
- [Quack FAQ](https://duckdb.org/quack/faq.html)
- [Quack core extension status](https://duckdb.org/docs/current/core_extensions/quack.html)

### 5.4 不应强行使用的场景

- 高频点查、短事务、行级锁竞争明显的 OLTP 主库。
- 需要数百或数千用户同时共享同一数据库服务的低延迟 BI。
- 单条查询必须自动跨多节点扩展。
- 需要数据库原生跨可用区高可用、自动故障转移和在线扩缩容。
- 不受信任用户可以任意加载扩展、访问文件系统或发起网络请求。
- 把同一个 DuckDB 原生文件放在共享网络文件系统上进行多进程写入。

---

## 6. DuckLake 社区与成熟度单独判断

### 6.1 已经成熟的部分

DuckLake v1.0 于 2026-04-13 发布。官方明确给出：

- production-ready specification。
- production-ready DuckDB `ducklake` 扩展。
- 向后兼容保证。
- SQL 数据库保存 Catalog 元数据，对象存储保存 Parquet 数据。
- 支持事务、并发读写、Schema 演化、分区、Time Travel 和维护操作。

材料：

- [DuckLake v1.0 announcement](https://ducklake.select/2026/04/13/ducklake-10/)
- [DuckLake stable documentation](https://ducklake.select/docs/stable/)
- [DuckLake FAQ](https://ducklake.select/faq)

因此，以下说法是合理的：

> 以 DuckDB 为主要引擎、PostgreSQL 等事务数据库为 Catalog、对象存储为数据层的 DuckLake v1.0，已经可以进入有边界的生产 PoC 和生产采用。

### 6.2 尚未成熟的部分

“DuckLake 已 production-ready”不能外推成“DuckLake 已有 Iceberg 级别的多引擎生态”。

当前公开实现：

| 引擎 / 项目 | 状态信号 | 判断 |
|---|---|---|
| DuckDB `ducklake` | 官方参考实现、v1.0 兼容承诺 | 主路径 |
| DataFusion `datafusion-ducklake` | 社区实现，持续更新 | 值得 PoC，需验证功能矩阵 |
| Spark `ducklake-spark` | MotherDuck 维护，项目较新 | 早期 |
| Trino 实现 | 存在多个社区仓库 | 分散，需谨慎选型 |
| PostgreSQL `pg_ducklake` | RelytCloud 开源，持续更新 | 有明确方向，生产证据有限 |
| MotherDuck Hosted DuckLake | Public preview | 托管能力尚非 GA |

仓库与资料：

- [datafusion-contrib/datafusion-ducklake](https://github.com/datafusion-contrib/datafusion-ducklake)
- [motherduckdb/ducklake-spark](https://github.com/motherduckdb/ducklake-spark)
- [awitten1/trino-ducklake](https://github.com/awitten1/trino-ducklake)
- [brikk/trino-ducklake](https://github.com/brikk/trino-ducklake)
- [relytcloud/pg_ducklake](https://github.com/relytcloud/pg_ducklake)
- [pgducklake.select](https://pgducklake.select/)
- [DuckLake 1.0 on MotherDuck](https://motherduck.com/blog/announcing-ducklake-1-0-on-motherduck)

### 6.3 DuckLake 的社区信号

积极信号：

- 规范和参考实现均为 MIT。
- 一年多获得约 2,900 Star。
- DataFusion、Spark、Trino、PostgreSQL 已出现独立实现。
- MotherDuck 提供托管预览。
- SQL Catalog 模型降低了元数据调试和查询门槛。

风险信号：

- 规范和多数非 DuckDB 实现都很年轻。
- 多引擎写入、并发冲突和维护任务缺少大量公开生产案例。
- Catalog 数据库与对象存储需要一致备份和恢复。
- Compaction、快照过期、旧文件清理、孤儿文件清理仍是运维任务。
- 与企业治理平台、Catalog Federation 和数据共享生态的集成弱于 Iceberg。
- 多个社区 Trino 实现说明需求存在，也说明实现尚未收敛。

### 6.4 DuckLake 与 Iceberg 的现实选择

| 决策条件 | 更倾向 DuckLake | 更倾向 Iceberg |
|---|---|---|
| 主要计算引擎 | DuckDB | Spark、Trino、Flink、云数仓混合 |
| 目录偏好 | 现成 PostgreSQL/MySQL/SQLite | REST Catalog、Glue、Unity、Polaris 等 |
| 元数据调试 | 希望直接用 SQL 查询 | 接受格式专用元数据层 |
| 跨厂商治理 | 次要 | 核心要求 |
| 新格式接受度 | 可接受并愿意参与验证 | 需要保守、广泛生产证明 |
| 运维能力 | 能维护 Catalog DB + 对象存储 | 已有 Iceberg 平台和维护工具 |

判断：

> DuckLake 目前最有说服力的场景不是“替换所有 Iceberg”，而是为 DuckDB 主导的共享数据应用提供比单个 `.duckdb` 文件更好的并发、对象存储和事务能力。

---

## 7. 海外云厂商与平台动作

### 7.1 厂商矩阵

| 厂商 | 动作 | 对象 | 证据等级 | 准确解读 |
|---|---|---|---:|---|
| AWS | 签署收购 DuckLabs 的最终协议 | DuckDB 团队/公司 | A | 战略投入；截至 2026-08-27 仍待交割，不是收购开源项目 |
| AWS | S3 Tables、SageMaker Lakehouse、Glue/Lake Formation 与 DuckDB Iceberg 互操作 | DuckDB + Iceberg | B | 正式湖仓互操作，不是 DuckLake 托管服务 |
| Snowflake | Snowflake Postgres `pg_lake` 使用 DuckDB 执行分析查询 | DuckDB | A | 数据库产品内部采用 |
| Snowflake | Polaris Catalog 对 DuckDB 开放 | DuckDB + Iceberg | B | Open Catalog 互操作 |
| Databricks | Unity Catalog External Access 支持 DuckDB | DuckDB + Delta/Iceberg | B | 外部引擎读写开放表，当前文档包含 Beta/Preview 边界 |
| Cloudflare | R2 Data Catalog 提供 DuckDB 配置示例 | DuckDB + Iceberg | B | 官方支持的 Iceberg REST 互操作 |
| Microsoft Azure | Azure Databricks 文档列出 DuckDB 外部访问 | DuckDB + Unity Catalog | B | Databricks on Azure 能力，不等于 Azure 原生 DuckDB 服务 |
| Google Cloud | 可通过 GCS 和开放格式使用 DuckDB | DuckDB | D/基础兼容 | 未发现 Google Cloud 第一方 DuckDB 产品化公告 |
| MotherDuck | 基于 DuckDB 的 Serverless 云数仓和 Hypertenancy | DuckDB | A | 最直接的 DuckDB 商业化平台 |
| MotherDuck | Hosted DuckLake v1.0 Public Preview | DuckLake | B | 托管预览，尚不应表述为 GA |

### 7.2 AWS：从互操作上升到战略投入

2026-08-26，AWS 宣布已签署收购 DuckLabs 的最终协议。官方说明：

- 预计交易将在满足惯常交割条件后很快完成。
- DuckLabs 团队将在交割后加入 AWS。
- 创始人 Hannes Mühleisen 和 Mark Raasveldt 将继续领导团队和开源项目技术方向。
- AWS **不收购 DuckDB 开源项目**。
- DuckDB 将继续由独立 DuckDB Foundation 监督并采用 MIT 许可证。
- 交割前 DuckDB 用户没有变化。

一手来源：

- [AWS to acquire DuckLabs, the company behind DuckDB](https://www.aboutamazon.com/news/company-news/aws-ducklabs)
- [AWS and DuckLabs: Building the future of analytics together](https://aws.amazon.com/blogs/big-data/aws-and-ducklabs-building-the-future-of-analytics-together/)
- [DuckLabs is joining AWS](https://ducklabs.com/ducklabs-is-joining-aws)

AWS 对潜在协同的公开描述包括 S3、Redshift、Athena、EMR、Glue ETL 和 SageMaker，但在交易尚未完成时，不能把这些表述成已经发布的产品集成。

交易前的正式技术动作主要围绕 Iceberg：

- [Streamlining access to Amazon S3 Tables with DuckDB](https://aws.amazon.com/blogs/storage/streamlining-access-to-tabular-datasets-stored-in-amazon-s3-tables-with-duckdb/)
- [DuckDB support for Amazon S3 Tables – preview](https://duckdb.org/2025/03/14/preview-amazon-s3-tables)
- [New Iceberg features in DuckDB](https://duckdb.org/2026/05/29/new-iceberg-features)

DuckDB 官方还维护了 Quack 的 EC2 CloudFormation 和 AMI 示例，可一键部署 DuckDB + Quack + nginx + Let's Encrypt。它由 DuckDB 项目维护，用于证明自托管可行性，不是 AWS 产品或 SLA：

- [DuckDB Quack deployment guide](https://www.duckdb.org/docs/current/quack/setup/deployment.html)
- [duckdb/duckdb-quack-infra](https://github.com/duckdb/duckdb-quack-infra)

**判断：** AWS 已从 B 级互操作跃升为 A 级战略动作；真正的产品整合方向要等交易完成和后续服务公告。

### 7.3 Snowflake：两条独立路线

#### 路线一：Snowflake Postgres `pg_lake`

Snowflake 将 Crunchy Data Warehouse 相关能力发展为 `pg_lake`。公开架构中，PostgreSQL 负责接口和事务语义，部分分析执行委派给 DuckDB 侧组件。

- [pg_lake: Postgres with lakehouse integration](https://www.snowflake.com/en/engineering-blog/pg-lake-postgres-lakehouse-integration/)
- [Snowflake Postgres pg_lake documentation](https://docs.snowflake.com/en/user-guide/snowflake-postgres/postgres-pg_lake)
- [Snowflake-Labs/pg_lake](https://github.com/Snowflake-Labs/pg_lake)

这属于 DuckDB 的产品内部采用，而不是简单连接器。

#### 路线二：Polaris / Horizon 开放目录

Snowflake 通过 Polaris Catalog 和 Horizon Catalog 让外部引擎访问 Iceberg 表，官方明确提到 DuckDB 兼容：

- [Polaris Catalog open source announcement](https://www.snowflake.com/blog/polaris-catalog-open-source/)
- [Query Snowflake-managed Iceberg tables with external engines](https://docs.snowflake.com/en/user-guide/tables-iceberg-access-using-external-query-engine-snowflake-horizon)

这条路线证明 DuckDB 是 Snowflake 开放数据生态中的客户端，但底层格式是 Iceberg。

### 7.4 Databricks：开放 Catalog 的外部引擎

Databricks Unity Catalog External Access 允许 DuckDB 等外部引擎通过开放 API 访问受治理的表。官方材料描述了 DuckDB 对 Managed Delta 和开放表的访问路径，具体读写能力需要以当前 Beta/Preview 功能矩阵为准。

- [Expanded interoperability with Unity Catalog open APIs](https://www.databricks.com/blog/expanded-interoperability-unity-catalog-open-apis)
- [Unity Catalog managed tables: interoperability and governance](https://www.databricks.com/blog/how-unity-catalog-managed-tables-bring-interoperability-performance-and-unified-governance)
- [Databricks external access documentation](https://docs.databricks.com/external-access/unity-rest.html)
- [Azure Databricks external access documentation](https://learn.microsoft.com/en-us/azure/databricks/external-access/unity-rest)

**判断：** 这是 B 级正式互操作，不是 Databricks 以 DuckDB 替换 Spark/Photon。

### 7.5 Cloudflare：R2 Data Catalog

Cloudflare R2 Data Catalog 提供 DuckDB 的官方配置示例。DuckDB 1.4 及以上可通过 Iceberg REST Catalog Attach 目录并读写表：

- [Cloudflare R2 Data Catalog: DuckDB](https://developers.cloudflare.com/r2/data-catalog/config-examples/duckdb/)

**判断：** Cloudflare 把 DuckDB 视为 R2 开放湖仓的受支持客户端。其价值是边缘对象存储和本地执行的组合，不代表 Cloudflare 内部查询引擎采用 DuckDB。

### 7.6 Microsoft Azure 和 Google Cloud

**Azure：**

- DuckDB 可以访问 Azure Blob/ADLS。
- Azure Databricks 的官方文档包含 DuckDB 外部访问。
- 截至调研日，未发现 Azure 自有数据库或 Fabric 发布第一方 DuckDB 托管服务。

**Google Cloud：**

- DuckDB 可以通过 GCS 和开放文件格式运行。
- MotherDuck 等第三方可以部署或连接 Google Cloud 数据。
- 截至调研日，未发现 Google Cloud 第一方 DuckDB/DuckLake 产品公告。

这里的“未发现”是基于官方域名、产品文档和公告的检索结论，不等同于断言不存在内部实验或未公开项目。

### 7.7 MotherDuck：DuckDB 原生商业化

MotherDuck 提供基于 DuckDB 的托管 Serverless 数据仓库。其核心架构不是把所有租户集中到少量大集群，而是 Hypertenancy：

- 每个用户、会话或 Agent 可以使用独立 Duckling。
- 计算和数据分离。
- 本地 DuckDB 与云端协作查询。
- 平台负责身份、共享、持久化、并发和资源控制。

MotherDuck 官网宣称可实现小于 100 ms 的冷启动等指标，这些属于厂商自报，应通过业务 PoC 验证：

- [MotherDuck](https://motherduck.com/)
- [DuckLake 1.0 on MotherDuck](https://motherduck.com/blog/announcing-ducklake-1-0-on-motherduck)
- [DuckLake architecture deep dive](https://motherduck.com/blog/ducklake-architecture-deep-dive/)
- [Self-hosting DuckDB: the road to production](https://motherduck.com/blog/self-hosting-duckdb-road-to-production/)

---

## 8. 国内云厂商与 ISV 动作

### 8.1 国内厂商矩阵

| 厂商 | 动作 | 形态 | 证据等级 | 判断 |
|---|---|---|---:|---|
| 阿里云 RDS MySQL | DuckDB 分析主实例、分析只读实例 | 正式云数据库产品 | A | 国内最完整的 DuckDB 产品化之一 |
| 阿里云 RDS PostgreSQL | `rds_duckdb` / DuckDB 分析实例 | 正式云数据库产品 | A | 面向 AP 加速和 TP/AP 隔离 |
| 阿里云 PolarDB 团队 | `duckdb-paimon` 开源扩展 | 湖仓格式集成 | C | DuckDB 直读 Paimon，仍是较新项目 |
| 腾讯云 PostgreSQL | `pg_lake` DuckDB 加速 | 正式云数据库产品 | A | 列存表、同步表、查询下推 |
| 华为云 | 未发现第一方产品化公告 | - | - | 不能把社区文章视为云服务采用 |
| 火山引擎 / ByteHouse | 未发现第一方产品化公告 | - | - | 暂无足够证据列入采用 |
| 百度智能云 | 未发现第一方产品化公告 | - | - | 暂无足够证据列入采用 |
| RelytCloud | `pg_ducklake`、`pg_duckpipe` | 开源 PostgreSQL 集成 | C | DuckLake/Postgres 方向活跃，公开生产证据有限 |

### 8.2 阿里云 RDS MySQL：直接产品化 DuckDB 分析实例

阿里云已提供两类值得区分的产品形态：

#### DuckDB 分析主实例

官方发布材料说明 DuckDB 引擎嵌入 RDS MySQL 内核，面向分析型负载提供列式和向量化执行。厂商宣称分析性能提升可超过 100 倍、存储降低超过 50%；这些是供应商测试口径，应结合数据模型和查询验证。

- [DuckDB-based analytical primary instances are available](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/duckdb-based-analytical-primary-instances-are-available-for-apsaradb-rds)
- [Create and connect to a DuckDB analytical primary instance](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/create-and-connect-to-a-duckdb-based-analytical-primary-instance)
- [Analytical primary instance specifications](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/specifications-for-duckdb-based-analytical-primary-instances)

#### DuckDB 分析只读实例

分析只读实例挂载到现有 MySQL 主实例，通过独立端点承载 OLAP 查询，实现 TP/AP 资源隔离。文档显示支持多种 MySQL 5.7/8.0、高可用版或集群版组合，具体区域和规格以购买页为准。

- [Add a DuckDB analytical read-only instance](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/add-a-duckdb-based-analytical-read-only-node-to-an-rds-for-mysql-high-availability-edition-instance)
- [Feature update: expanded DuckDB analytical read-only support](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/duckdb-based-analytical-read-only-instances-can-be-added-to-specific-rds-for-mysql-5-7-and-8-0-instances)
- [TPC-H performance test](https://help.aliyun.com/en/rds/apsaradb-rds-for-mysql/tpc-h-based-performance-testing-for-duckdb-based-analytical-read-only-instances)

**判断：** 这不是“在 ECS 上安装 DuckDB”，而是 RDS 产品线对 DuckDB 内核能力的直接吸收。

### 8.3 阿里云 RDS PostgreSQL：`rds_duckdb` 与独立分析实例

阿里云 RDS PostgreSQL 提供基于 DuckDB 的分析加速：

- 列式存储和向量化执行。
- 对适合的分析查询进行路由或卸载。
- 可在主实例启用，也可创建独立 DuckDB 分析实例。
- 独立节点实现 AP 与 TP 资源隔离。
- 文档提示列存数据会额外占用存储，通常约为原始数据量的 20%–50%。

材料：

- [Use the rds_duckdb extension](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/duckdb-analytics-acceleration/)
- [DuckDB-based analytical instance](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/duckdb-based-analytical-instance)
- [Enable DuckDB for the primary instance](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/enable-duckdb-for-the-master-instance)

**判断：** 这是典型的 PostgreSQL 兼容接口 + DuckDB AP 执行路径，采购和使用体验比自行维护 `pg_duckdb` 更接近云数据库产品。

### 8.4 阿里云 PolarDB 团队：`duckdb-paimon`

PolarDB 团队开源了 `duckdb-paimon`：

- DuckDB 直接读取 Apache Paimon。
- 纯 C++，不依赖 JVM。
- 支持本地、OSS/S3 等存储路径。
- 可与 Arrow 等 DuckDB 数据交换方式组合。
- 已进入 DuckDB Community Extensions 页面。

材料：

- [polardb/duckdb-paimon](https://github.com/polardb/duckdb-paimon)
- [DuckDB Community Extension: paimon](https://www.duckdb.org/community_extensions/extensions/paimon)

截至调研日，该项目约 44 Star、项目年龄不足一年。它是有明确维护方的 C 级集成，适合验证 Paimon 数据的轻量读取，但不能按成熟核心扩展评估。

### 8.5 腾讯云 PostgreSQL：`pg_lake`

腾讯云数据库 PostgreSQL 官方文档提供基于 DuckDB 的 `pg_lake` 加速能力，包含两种表：

1. **DuckDB 列存表**：使用 `USING duckdb`，直接采用列式分析路径。
2. **同步表**：一张 PostgreSQL heap 表负责业务写入，一张 DuckDB 镜像表通过逻辑复制异步同步，分析查询可自动路由到镜像。

系统还包含：

- 完整 SQL 下推到 DuckDB 的 Custom Scan。
- 自动路由和手动控制。
- 同步状态管理与强制追赶。
- 无法下推时的回退路径。
- 对跨普通 heap 表子查询、特殊函数和修改型 CTE 等边界的说明。

材料：[腾讯云数据库 PostgreSQL DuckDB 加速功能](https://cloud.tencent.com/document/product/409/134732)

**判断：** 腾讯云文档不仅宣称“支持 DuckDB”，还公开了镜像、同步、路由和下推语义，属于 A 级正式产品能力。实际采用应重点测试同步延迟和查询回退。

### 8.6 国内尚未发现充分证据的厂商

截至 2026-08-27，在华为云、火山引擎/ByteHouse、百度智能云等官方产品文档和公告中，未检索到可归入 A/B 级的 DuckDB 或 DuckLake 产品动作。

不纳入正式采用证据的内容包括：

- 社区作者发布在云厂商开发者社区的教程。
- “DuckDB vs 某数据库”的 SEO 或科普文章。
- 在云主机上手工安装 DuckDB。
- 第三方镜像或个人 GitHub 项目。

这是一项时间点结论。厂商可能存在未公开研发、客户自建实践或后续发布，建议按季度复查。

### 8.7 RelytCloud：PostgreSQL 与 DuckLake 连接

RelytCloud 开源了：

- [`pg_ducklake`](https://github.com/relytcloud/pg_ducklake)：让 PostgreSQL 访问 DuckLake。
- [`pg_duckpipe`](https://github.com/relytcloud/pg_duckpipe)：围绕 PostgreSQL 和分析数据流动的相关项目。

`pg_ducklake` 在 2026 年仍持续提交，说明 PostgreSQL 作为 DuckLake Catalog/访问入口的方向受到关注。但目前公开案例和跨版本兼容证据有限，适合列为 C 级生态项目。

---

## 9. ISV 和数据工具生态

### 9.1 集成矩阵

| ISV / 项目 | 集成方式 | 支持性质 | 适用位置 |
|---|---|---|---|
| dbt-duckdb | dbt Adapter、DuckLake 配置 | 社区维护，非 dbt Labs 官方支持 | 本地建模、CI、小型管道、DuckLake |
| Dagster | DuckDB I/O Manager | Dagster 官方集成文档 | Pandas/Polars/PySpark 资产落地 |
| Airbyte | DuckDB、MotherDuck Destination | 本地 DuckDB 自托管；MotherDuck Certified | ELT 目标 |
| dlt | DuckDB 默认入门目标、MotherDuck 路径 | 官方维护 | Python 数据加载和本地开发 |
| Rill | 内嵌 DuckDB | 产品核心组件 | BI-as-code |
| Evidence | DuckDB-Wasm / DuckDB 数据源 | 产品核心组件 | 浏览器 BI 和数据应用 |
| Hex | DuckDB + Arrow | 产品内部运行时 | Lazy DataFrame |
| LanceDB / DuckLabs | `lance` 扩展 | 双方合作、社区扩展 | 向量、搜索和多模态 |
| MotherDuck | 托管 DuckDB | 商业服务 | 共享、Serverless、多租户 |
| pg_duckdb | PostgreSQL 扩展 | DuckDB 官方关联项目 | PostgreSQL 内嵌 OLAP |

### 9.2 dbt

`dbt-duckdb` 是最重要的数据工程入口之一：

- 本地 DuckDB 文件和内存数据库。
- 外部 Parquet、CSV、JSON。
- MotherDuck。
- DuckLake（特定版本以上）。
- 扩展加载和 S3 等外部数据。

必须注意支持口径：传统 Python Adapter 页面标为 Community Maintained，dbt Labs 不提供官方支持。企业使用时不能把“出现在 dbt 文档”理解为 dbt Cloud SLA。

- [dbt DuckDB setup](https://docs.getdbt.com/docs/core/connect-data-platform/duckdb-setup)
- [dbt DuckDB configurations](https://docs.getdbt.com/reference/resource-configs/duckdb-configs)
- [dbt DuckDB Iceberg support](https://docs.getdbt.com/docs/build/iceberg/adapters/duckdb-iceberg-support)
- [duckdb/dbt-duckdb](https://github.com/duckdb/dbt-duckdb)

### 9.3 Dagster

Dagster 提供 DuckDB I/O Manager，可把资产在 DuckDB 中物化，并支持 Pandas、Polars 和 PySpark 等数据对象：

- [Dagster DuckDB integration](https://docs.dagster.io/integrations/libraries/duckdb/)
- [Dagster DuckDB reference](https://docs.dagster.io/integrations/libraries/duckdb/reference)

适合本地管道、小中型单机任务和测试。大规模并发调度时仍要给每个运行分配独立文件或明确写入协调。

### 9.4 Airbyte 和 dlt

Airbyte：

- 本地 DuckDB Destination 更适合自托管和开发环境。
- Airbyte Cloud 不把本地文件作为持久化共享目标。
- MotherDuck 已成为 Certified Destination，提供托管持久化路径。

材料：

- [Airbyte DuckDB destination](https://docs.airbyte.com/integrations/destinations/duckdb)
- [Airbyte MotherDuck destination](https://docs.airbyte.com/integrations/destinations/motherduck)
- [MotherDuck certified destination](https://airbyte.com/blog/motherduck-certified-destination)

dlt 的入门路径默认常用 DuckDB 作为本地目标，说明 DuckDB 已成为 Python ELT 的开发体验基线之一：

- [dlt: Load data from an API](https://dlthub.com/docs/tutorial/load-data-from-an-api)

### 9.5 LanceDB：向量和多模态方向

DuckLabs 与 LanceDB 合作开发 `lance` 扩展，使 DuckDB 可以访问 Lance 数据集并组合 SQL、向量和混合搜索：

- [Test-driving Lance with DuckDB](https://duckdb.org/2026/05/21/test-driving-lance)

这是 DuckDB 从结构化 OLAP 向 Agent/AI 数据访问扩张的重要信号，但扩展和数据格式的生产成熟度应单独评估，不能继承 DuckDB 核心的成熟度。

---

## 10. 厂商动作的结构性解读

### 10.1 为什么数据库厂商愿意采用 DuckDB

DuckDB 给厂商提供了一条比自研完整 OLAP 内核更短的路径：

- 成熟向量化执行。
- 列式扫描和复杂 SQL。
- 进程内 C++ 嵌入。
- Parquet、Arrow、对象存储和开放格式支持。
- MIT 允许商业产品修改和再分发。

因此 PostgreSQL/MySQL 产品可以保留原有协议、生态和事务入口，只把分析查询或镜像表交给 DuckDB。这正是 Snowflake、阿里云和腾讯云动作的共同逻辑。

### 10.2 为什么湖仓厂商主动支持 DuckDB

开放 Catalog 需要证明“数据不被单一计算引擎锁定”。DuckDB 具备：

- 安装快。
- 无集群依赖。
- 可以直接展示读写和 SQL。
- 开发者认知度高。

所以 DuckDB 已成为 Iceberg REST Catalog 和开放表格式的“互操作试金石”。这是一种生态地位，但不一定代表厂商把 DuckDB 用作内部执行引擎。

### 10.3 为什么 DuckLake 采用比 DuckDB 慢

DuckDB 只需嵌入一个库；DuckLake 要改变共享数据格式和运营模型：

- 选择并运营 Catalog 数据库。
- 设计对象存储布局和权限。
- 处理并发写、冲突、Compaction、快照和垃圾回收。
- 让多个引擎实现同一规范。
- 接入治理、血缘、权限和数据共享平台。

因此 DuckDB 可以在一个团队内局部采用，DuckLake 往往需要平台级决策和更长验证周期。

---

## 11. 风险、观察项与尽调问题

### 11.1 AWS 收购后的治理观察

未来 6–12 个月重点关注：

1. DuckDB Foundation 的董事、商标、发布和路线决策是否保持透明。
2. 非 AWS 云的文件系统、Catalog 和身份集成是否保持同等优先级。
3. 核心扩展和社区扩展的维护主体是否变化。
4. AWS 是否推出托管 DuckDB、S3 本地执行或更深的 Athena/Redshift/Glue 集成。
5. MotherDuck 与 AWS 新关系如何演变。
6. 其他云厂商是继续采用 DuckDB，还是因竞争关系转向 Fork 或替代内核。

### 11.2 选型前应向供应商确认

**DuckDB 嵌入式产品：**

- 使用哪个 DuckDB 版本，多久升级一次？
- 是否修改内核，能否复现上游问题？
- 哪些扩展允许加载，是否签名和固定版本？
- 内存、CPU、临时磁盘和查询超时如何隔离？
- 崩溃影响单任务、单租户还是整个服务？
- 是否支持查询取消、审计和资源画像？

**PostgreSQL/MySQL 加速产品：**

- 数据同步是同步还是异步，典型和最大延迟是多少？
- 哪些 SQL 会路由到 DuckDB，如何从执行计划识别？
- 不能下推时是报错还是回退，性能如何？
- DDL、UPDATE、DELETE、索引、约束和事务隔离语义是什么？
- 备份恢复是否同时覆盖行存和列存副本？

**DuckLake：**

- 支持规范的哪个版本和哪些可选能力？
- Catalog HA、备份和 Point-in-Time Recovery 如何做？
- Catalog 与对象文件如何取得一致恢复点？
- Compaction、快照过期和孤儿文件清理由谁调度？
- 非 DuckDB 引擎能读、能写，还是只读？
- 并发写冲突和重试的业务语义是什么？
- 是否有生产规模、恢复演练和升级案例？

### 11.3 Benchmark 解释原则

- “快 100 倍”通常来自行存数据库执行大扫描的对照，不能外推到所有查询。
- 需要同时测冷缓存、热缓存和对象存储请求。
- 将数据预转为 Parquet/列存的时间和成本计入总体。
- 至少测试 P50、P95、失败率和内存峰值，不只测最快单次。
- 测试并发时要区分“每个请求独立 DuckDB”和“多个请求争用同一实例”。
- 云厂商和 ISV 的数字均按厂商自报处理，除非存在可复现实验。

---

## 12. 技术雷达与建议

### 12.1 建议进入 Adopt / Trial 的方向

**Adopt：**

- 开发机和 Notebook 的默认 SQL 分析引擎。
- Parquet/CSV/JSON 的本地检查和转换。
- 数据管道单元测试、CI 和小中型单机 ETL。
- 应用内单用户、单任务或单结果集分析。

**Trial：**

- S3 上有良好文件布局的数据集按需查询。
- Serverless 文件处理和任务级并行。
- 浏览器内裁剪后数据集的交互分析。
- 通过云厂商正式能力做 PostgreSQL/MySQL AP 加速。
- DuckDB 访问 Iceberg REST Catalog。
- DuckLake v1.0 的 DuckDB 主导型共享湖仓。

**Assess：**

- DuckLake 多引擎读写。
- Agentic BI / MCP 直接 SQL。
- Lance 等向量/多模态扩展。
- Quack 远程访问：由唯一 Server 持有数据库文件，多个 Client 经协议间接读写。
- 把 DuckDB 包装为高并发多租户数据库服务。

### 12.2 推荐验证 PoC

#### PoC 1：对象存储轻量分析

```text
S3 Parquet
  -> DuckDB 本地 / ECS / Lambda
  -> 与 Athena、Spark 对比
```

比较：

- 1 GB、10 GB、100 GB 和 1 TB 数据。
- 大文件与小文件。
- 冷缓存与热缓存。
- 单用户和并发任务。
- 扫描字节、S3 请求、总耗时和成本。

#### PoC 2：PostgreSQL/MySQL AP 加速

选择阿里云或腾讯云正式产品能力，验证：

- TPC-H 只是基线，主测试使用真实 Schema 和查询。
- 数据同步延迟。
- 路由命中率和回退。
- 对 TP 的资源影响。
- DDL 和 Schema 变更。
- 故障与恢复。

#### PoC 3：DuckLake 与 Iceberg 对照

同一份对象存储数据分别验证：

- DuckLake + PostgreSQL Catalog + DuckDB。
- Iceberg + REST/Glue Catalog + DuckDB/Athena/Trino。

比较：

- 建表和写入。
- 并发 writer。
- Time Travel 和 Schema 演化。
- Compaction 和清理。
- Catalog 备份恢复。
- 第二计算引擎的读写兼容。

#### PoC 4：Agent 数据访问

不要先让 Agent 访问任意原始表。建议：

```text
受治理的语义视图 / 用户级 Parquet
  -> 查询代理
  -> 每会话 DuckDB
  -> SQL 白名单、扫描预算、超时和结果行数限制
  -> Agent
```

验证越权、Prompt Injection、资源耗尽、结果引用和审计。

#### PoC 5：Quack 远程服务

```text
DuckDB clients
  -> HTTPS reverse proxy
  -> one Quack Server
  -> EBS .duckdb and/or S3/DuckLake
```

重点验证：

- `quack_query` 与 `ATTACH` 的无状态/有状态行为。
- 首次 TLS、连接复用和大结果集传输开销。
- 多 Client 查询和写入时的吞吐、排队与事务冲突。
- Server OOM、进程重启和持久文件恢复。
- Token 轮换、授权 callback、审计和网络隔离。
- Client/Server 跨补丁版本和升级后的兼容性。
- 多 Server 使用 DuckLake 时的会话路由和 catalog 冲突。

---

## 13. 结论

### 13.1 DuckDB

DuckDB 的社区和工程实践已经跨过“是否可用”的阶段，当前问题是“在哪个边界内使用最划算”。

最可靠的定位是：

> 一个可以嵌入任何数据工作流的高性能单节点分析内核，以及开放文件和湖仓格式的轻量 SQL 客户端。

社区已经充分证明它适合本地分析、应用内分析、数据产品、Serverless 文件处理、浏览器 BI 和单机 ETL。云厂商开始把它吸收到 PostgreSQL/MySQL 和开放湖仓产品中，说明其影响已经从开发者工具进入数据库产品层。

Quack 进一步补上了“自托管远程 DuckDB”这一交互形态，但截至调研日仍应与 DuckDB 内核的高成熟度分开评价。

### 13.2 DuckLake

DuckLake v1.0 已具备生产级规范和 DuckDB 参考实现，但没有足够证据把它评价成全面成熟的多引擎湖仓标准。

最准确的结论是：

> DuckLake 已经适合 DuckDB 主导、愿意运营 Catalog 数据库的受控生产场景；对于跨引擎、跨厂商治理平台，仍应把 Iceberg 作为成熟度基准。

### 13.3 厂商生态

厂商动作已经呈现清晰分层：

1. **AWS**：已签署收购 DuckLabs 的最终协议，后续影响可能最大；截至调研日，交易和产品整合仍待完成。
2. **阿里云、腾讯云、Snowflake**：把 DuckDB 用进数据库产品或分析执行路径，是最强的采用证据。
3. **Databricks、Cloudflare、Snowflake Polaris、AWS S3 Tables**：把 DuckDB 作为开放湖仓客户端，是生态地位的证明。
4. **MotherDuck**：补齐开源 DuckDB 缺少的云端并发、共享、身份和运营控制面。
5. **Quack**：补齐官方自托管远程协议和轻量 Server 形态，但仍处 Beta。
6. **DuckLake**：已获多引擎项目响应，但离 Iceberg 级生态仍有明显距离。

### 13.4 加上 Quack 后还缺什么

加入 Quack 后，可以从四层理解 DuckDB 相关组件：

```text
Interaction / access
  Embedded APIs | CLI/JDBC | DuckDB-Wasm | Quack
                          |
                          v
Execution
  DuckDB vectorized single-node OLAP engine
                          |
                          v
Data and storage
  native .duckdb | Arrow/DataFrame | Parquet/S3
  Iceberg/Delta/Lance | DuckLake
                          |
                          v
Service and control plane
  self-hosted Quack | MotherDuck
  cloud PostgreSQL/MySQL acceleration | application-owned services
```

四个关键边界分别是：

- **DuckDB**：执行引擎和进程内数据库。
- **Quack**：远程交互协议和轻量 Server facade。
- **DuckLake**：共享湖仓数据和事务格式。
- **MotherDuck/云厂商产品**：托管或产品化控制面。

这四层已经覆盖引擎、交互、数据和服务形态，但开源 DuckDB/Quack 仍不提供分布式执行、企业级 HA、多租户调度、统一 IAM/RBAC、自动备份和服务运营。这些通常由托管服务或外围平台承担，不宜写成 DuckDB 内核已经具备的能力。

---

## 14. 推荐阅读顺序

### 社区和生产实践

1. [Watershed production engineering blog](https://watershed.com/de/blog/how-watershed-uses-duckdb-to-reliably-compute-customer-footprints)
2. [Mode migration to DuckDB](https://mode.com/blog/how-we-switched-in-memory-data-engine-to-duck-db-to-boost-visual-data-exploration-speed/)
3. [Hex Lazy DataFrames](https://hex.tech/blog/lazy-dataframes/)
4. [Okta Data Council slides](https://2575662.fs1.hubspotusercontent-na1.net/hubfs/2575662/Data%20Council/Data_Eng_Infra_1.2_Jake_Thomas_Processing_Trillions_Of_Records_With_Tiny_Serverless_Databases%20%281%29.pdf)
5. [Evidence Universal SQL](https://evidence.dev/blog/why-we-built-usql)
6. [Fivetran DuckDB benchmark and limits](https://www.fivetran.com/blog/how-fast-is-duckdb-really)
7. [DuckDB use cases discovered through GitHub](https://duckdb.org/2025/06/27/discovering-w-github.html)

### Quack

8. [Quack announcement and overview](https://duckdb.org/quack)
9. [Quack protocol documentation](https://www.duckdb.org/docs/current/quack/overview.html)
10. [Quack security](https://www.duckdb.org/docs/current/quack/security.html)
11. [Deploying Quack](https://www.duckdb.org/docs/current/quack/setup/deployment.html)
12. [Quack FAQ](https://duckdb.org/quack/faq.html)

### DuckLake

13. [DuckLake v1.0](https://ducklake.select/2026/04/13/ducklake-10/)
14. [DuckLake stable documentation](https://ducklake.select/docs/stable/)
15. [DuckLake FAQ](https://ducklake.select/faq)
16. [MotherDuck DuckLake architecture](https://motherduck.com/blog/ducklake-architecture-deep-dive/)

### 云厂商

17. [AWS to acquire DuckLabs](https://www.aboutamazon.com/news/company-news/aws-ducklabs)
18. [AWS S3 Tables with DuckDB](https://aws.amazon.com/blogs/storage/streamlining-access-to-tabular-datasets-stored-in-amazon-s3-tables-with-duckdb/)
19. [Snowflake pg_lake](https://www.snowflake.com/en/engineering-blog/pg-lake-postgres-lakehouse-integration/)
20. [Databricks Unity Catalog external access](https://docs.databricks.com/external-access/unity-rest.html)
21. [Cloudflare R2 Data Catalog with DuckDB](https://developers.cloudflare.com/r2/data-catalog/config-examples/duckdb/)
22. [阿里云 RDS MySQL DuckDB 分析实例](https://help.aliyun.com/zh/rds/apsaradb-rds-for-mysql/duckdb-analysis-instance-29/)
23. [阿里云 RDS PostgreSQL DuckDB 分析实例](https://help.aliyun.com/en/rds/apsaradb-rds-for-postgresql/duckdb-based-analytical-instance)
24. [腾讯云 PostgreSQL DuckDB 加速](https://cloud.tencent.com/document/product/409/134732)

---

## 15. 结论口径与复查时间

- GitHub、npm、产品状态和版本信息均为 2026-08-27 快照。
- AWS 收购 DuckLabs 在本报告日期为“已签署最终协议、尚待完成交割”。
- MotherDuck Hosted DuckLake 在本报告日期为 Public Preview。
- Quack 在 DuckDB v1.5.3 起作为 core extension 发布，但在本报告日期仍为 Beta/Experimental；v2.0 稳定状态是官方计划，不是当前事实。
- 云厂商产品区域、规格、Preview/GA 状态可能变化，正式选型前应重新核对购买页和当前文档。
- 厂商性能数字均标记为供应商自报，不视为独立 Benchmark。
- 建议在 AWS 交易完成后 3 个月，以及 DuckLake v1.1 发布后，分别复查本报告。
