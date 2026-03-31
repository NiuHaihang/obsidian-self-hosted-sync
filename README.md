# Self-Hosted Sync for Obsidian

一个用于 Obsidian 的自托管同步 MVP，目标是提供“类 Git merge”的多客户端同步能力，
避免因客户端版本不一致导致的误删。

## 核心能力

- 多客户端三方合并（`base/local/remote-head`）
- 显式删除语义与墓碑策略（避免“缺失即删除”）
- 冲突可见（冲突记录与冲突副本保留）
- 自托管部署（Docker Compose）
- 自动化测试覆盖（contract/integration/e2e）

## 目录结构

- `apps/obsidian-plugin/`: 插件端同步编排、设置与状态 UI
- `apps/sync-server/`: 同步服务端 API、合并引擎、冲突处理
- `packages/shared-contracts/`: 错误码与契约共享
- `infra/docker/`: Dockerfile、Compose 与环境变量模板
- `tests/e2e/`: 端到端回归测试
- `specs/20260331-obsidian-sync-merge/`: spec/plan/tasks 与设计文档

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 类型检查

```bash
npm run build
```

3. 运行测试

```bash
npm test
```

4. 启动服务端（开发模式）

```bash
npm run start:server
```

## Docker 启动

```bash
cp infra/docker/.env.example infra/docker/.env
docker compose -f infra/docker/docker-compose.yml up -d
```

健康检查：

```bash
./scripts/smoke/docker-health.sh http://localhost:8787
```

## Obsidian 插件使用

1. 构建并一键安装到你的 Vault：

```bash
npm run plugin:install -- "<YOUR_VAULT_PATH>"
```

2. 在 Obsidian 启用插件：

- `Settings -> Community plugins`
- 关闭 `Safe mode`
- 启用 `Self Hosted Sync`

3. 打开插件设置，填写并保存：

- `Server URL`（例如 `http://127.0.0.1:8787`）
- `Space ID`
- `Access Token`（如果已注册）
- `Client ID`（如果已注册）

4. 首次使用可直接在设置页点击 `注册` 自动获取 `client_id/access_token`：

- 填写 `Register Device ID`、`Register Client Name`
- 点击 `注册`
- 成功后回到设置页点击 `保存`（可再点一次 `测试连接`）

5. 命令面板可用命令：

- `Self Hosted Sync: Run manual sync`
- `Self Hosted Sync: Show pending conflicts`
- `Self Hosted Sync: Resolve all conflicts (ours)`
- `Self Hosted Sync: Resolve all conflicts (theirs)`

详细插件打包与安装说明见 `apps/obsidian-plugin/README.md`。

## 生产环境与 PostgreSQL 集成验证

1. 配置 PostgreSQL 模式并准备环境变量：

```bash
cp infra/docker/.env.example infra/docker/.env
# 确认以下关键参数
# SYNC_STORAGE_BACKEND=postgres
# POSTGRES_HOST=db
```

2. 启动数据库与对象存储：

```bash
docker compose -f infra/docker/docker-compose.yml up -d db object-store
```

3. 执行迁移并启动服务：

```bash
npm run db:migrate
npm run start:server
```

4. 生产可用性最小检查：

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/readyz
curl http://localhost:8787/v1/admin/migrations/status
```

5. PostgreSQL 回归验证：

```bash
npm run build
npm run test:pg
```

夜间长回归：

```bash
./scripts/ci/nightly-pg-regression.sh 100
```

## 说明

- 当前服务端仓储默认是内存实现（用于 MVP 验证流程）。
- 已补充 PostgreSQL 集成方案与验证链路，建议在发布前至少执行一次 `test:pg` 与 smoke。

更多细节见：

- `docs/architecture/sync-overview.md`
- `docs/postgresql-integration-troubleshooting.md`
- `docs/mvp-release.md`
- `specs/20260331-plugin-pg-storage/quickstart.md`
