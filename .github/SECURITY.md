# Security Policy

本仓库是短期技术 Demo，不提供生产环境支持或安全 SLA。安全修复以 `main` 分支为准。

请通过 GitHub Private Vulnerability Reporting 报告漏洞，不要在公开 Issue 中提交凭证、账号 ID、资源 ID、ARN、token、数据库连接串或可被直接利用的细节。仓库维护者需要在 GitHub 的 **Settings > Security > Private vulnerability reporting** 中启用该入口。

如果私密报告入口尚未启用，请先提交不含敏感细节的 Issue，说明需要私下联系维护者。不要在获得私密渠道前附上复现凭证或客户数据。

这个 Demo 会创建 EC2、RDS、S3、S3 Tables、Secrets Manager 和公网 IPv4 等资源。请在隔离的非生产账号中部署，使用生成数据，并在验证后运行 `scripts/destroy.sh`。
