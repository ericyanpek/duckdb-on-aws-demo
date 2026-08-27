# Contributing

这个仓库用于技术研究和可复现 Demo，欢迎修正文档事实、补充测试或改进部署脚本。为了让变更容易验证，请把一次提交控制在一个明确的问题内。

提交 Pull Request 前，请运行：

```bash
npm ci
npm run format:check
npm run build
npm run lint
npm test
shellcheck --severity=warning scripts/*.sh workbench/*.sh
```

涉及 CDK 的变更还应在自己的 AWS 账号中运行 `npm run synth` 和 `npm run diff`。不要提交 `cdk.context.json`、`cdk-outputs.json`、账号 ID、资源 ID、ARN、访问密钥、token、数据库密码或真实业务数据。

文档中的时效性信息需要注明复查日期，并优先引用项目官方文档、云厂商产品文档或使用方的一手工程材料。厂商自报性能数字应明确标注来源，不应写成独立 Benchmark 结论。

提交贡献即表示同意按仓库的 [Apache License 2.0](LICENSE) 提供该贡献。
