# Quickstart: Obsidian 自托管合并同步

## 1. 前置条件

- 已安装 Docker 与 Docker Compose
- 本机已安装 Obsidian（Desktop）
- 具备可访问服务端的网络环境

## 2. 启动服务端（Docker）

1. 准备环境变量文件：

```bash
cp infra/docker/.env.example infra/docker/.env
```

2. 启动服务：

```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

3. 健康检查：

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/readyz
```

期望返回 `{"status":"ok"}` 与 `{"status":"ready", ...}`。

## 3. 配置 Obsidian 插件

1. 在 Obsidian 启用插件后，打开插件设置页。
2. 填写以下配置：
   - `Server URL`: `http://<your-server>:8787`
   - `Space ID`: 你的 vault 空间 ID
   - `Access Token`: 注册后获取的 JWT
   - `Client ID`: 设备注册后返回的 client_id
3. 点击“连接测试”，确认可连通。

## 4. 执行首次同步

1. 客户端先执行一次 `Pull` 获取远端基线版本。
2. 点击“立即同步（Push）”上传本地变更。
3. 检查服务端日志与插件 UI，确认无鉴权或版本错误。

## 5. 验证防误删关键场景

按以下步骤验证用户核心诉求：

1. 客户端 A 创建 `abc.md`、`def.md`。
2. 客户端 B 创建 `def.md`、`ghk.md`（不先拉取 A 的新增）。
3. 先同步 A，再同步 B，最后两端各执行一次 Pull。
4. 验收条件：两端都保留 `abc.md`、`def.md`、`ghk.md`，不得出现仅剩 `def.md`。

## 6. 验证并发冲突处理

1. 两端同时修改同一个文件 `def.md` 为不同内容。
2. 依次同步两个客户端。
3. 验收条件：
   - 系统不丢失任一端内容。
   - 生成冲突记录或冲突文件。
   - 用户可以手动选择 `ours/theirs/manual` 完成解决。

## 7. 常见问题

- `401 AUTH_FAILED`: 检查 token 是否过期或配置错误。
- `412 EXPECTED_HEAD_MISMATCH`: 先执行 Pull 再重试 Push。
- `409 VERSION_TOO_OLD`: 客户端本地基线过旧，需全量拉取后再提交。
- `409 MERGE_CONFLICT`: 按冲突查询接口获取详情并提交解决结果。

## 8. 回归验证（新增）

在完成部署后，建议执行一次自动化回归：

```bash
npm test
./scripts/smoke/docker-health.sh http://localhost:8787
```

若失败，请先检查 `infra/docker/.env` 与服务日志，再重试验证。
