# GitHub 发布检查清单

这份清单用于第一次公开发布。它把可以自动验证的内容和必须由仓库所有者确认的事项分开。

## 公开前

- [ ] 确认仓库归属、名称、可见性和 Apache-2.0 许可证符合所在组织的开源发布流程。
- [ ] 确认 README 中的个人技术演示声明准确，不使用未经授权的 AWS 商标、Logo 或“官方 Sample”表述。
- [ ] 删除 Git 历史中的账号 ID、资源 ID、ARN、token、密码、客户名称和真实业务数据。
- [ ] 检查提交作者姓名和邮箱；GitHub 会公开每个提交中的 author/committer 信息。
- [ ] 重新核对带日期的产品状态，尤其是 AWS/DuckLabs 交易、Quack beta 状态、DuckLake 版本和云厂商 Preview/GA 状态。
- [ ] 在隔离的非生产账号重新部署、演示并执行 `scripts/destroy.sh`。

## 本地验证

```bash
git status --short
git diff --check
git log --format=fuller --stat

npm ci
npm run format:check
npm run build
npm run lint
npm test
npm audit
shellcheck --severity=warning scripts/*.sh workbench/*.sh
```

扫描当前可达历史中的常见敏感标识：

```bash
git rev-list --all |
  while read -r commit; do
    git grep -n -E \
      'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|arn:aws[a-z-]*:|i-[0-9a-f]{17}' \
      "${commit}" -- . || true
  done
```

12 位账号 ID 也应检查，但测试 fixture 中的 `123456789012` 和 `.github/fixtures/cdk.context.example.json` 是公开占位值。

## GitHub 设置

- [ ] 将默认分支设为 `main`。
- [ ] 为 `main` 启用 Pull Request、CI 必须通过和禁止 force push。
- [ ] 启用 Secret scanning、Push protection、Dependabot alerts 和 Private vulnerability reporting。
- [ ] 设置仓库 Description、Topics 和 Website；建议 Topics 包含 `duckdb`、`ducklake`、`quack`、`aws-cdk`、`amazon-s3`、`s3-tables`。
- [ ] 确认 GitHub Actions 只拥有只读 `contents` 权限。
- [ ] 创建 `v0.1.0` Release，并在发布说明中写明已验证的 Region、DuckDB 版本和非生产用途。

## 发布后

- [ ] 从一个没有本地缓存的新目录 clone 仓库，按 README 走一次完整流程。
- [ ] 检查 README 相对链接、Mermaid 架构图和外部引用。
- [ ] 每次更新调研结论时同步更新调研日期。
- [ ] 定期检查依赖告警、Issue 和失效链接。
