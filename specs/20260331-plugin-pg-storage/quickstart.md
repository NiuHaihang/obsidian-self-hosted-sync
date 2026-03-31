# Quickstart: PostgreSQL 存储集成验证

## 1. 前置条件

- 已安装 Docker 与 Docker Compose
- 具备 Node.js 20+ 运行环境
- 已获取仓库代码并安装依赖

## 2. 启动 PostgreSQL + 同步服务

1. 复制环境变量模板：

```bash
cp infra/docker/.env.example infra/docker/.env
```

2. 启动依赖服务：

```bash
docker compose -f infra/docker/docker-compose.yml up -d db object-store
```

3. 执行迁移并启动服务（示例）：

```bash
npm run db:migrate
npm run start:server
```

## 3. 生产环境集成验证（最小流程）

1. 验证数据库与服务就绪：

```bash
curl http://localhost:8787/healthz
curl http://localhost:8787/readyz
curl http://localhost:8787/v1/admin/migrations/status
```

2. 注册客户端：

```bash
curl -X POST http://localhost:8787/v1/spaces/11111111-1111-1111-1111-111111111111/clients \
  -H "content-type: application/json" \
  -d '{"device_id":"device-a","client_name":"device-a"}'
```

3. 用返回 token 执行 push 与 pull，确认请求成功且 `head_version` 可推进。

4. 重启服务后重复 pull，确认版本与冲突记录可恢复（验证 PostgreSQL 持久化）。

## 4. PostgreSQL 集成回归验证

```bash
npm run build
npm test
```

重点关注以下测试集：

- push/pull 契约测试
- conflict 查询与解决测试
- non-destructive merge 集成测试
- PostgreSQL 模式下 readiness 与重启恢复测试

## 5. 故障排查

- `readyz` 返回非 ready：优先检查数据库连接串、账号权限、迁移版本状态
- `/v1/admin/migrations/status` 返回 pending > 0：先执行 `npm run db:migrate`
- push 失败并提示版本相关错误：检查 `base_version` 与 `expected_head`
- 迁移失败：检查迁移日志，确认是否存在半执行迁移并按脚本修复
- 高并发超时：检查连接池上限、事务时长与慢查询

## 6. 本轮验证记录

- 执行时间：2026-03-31
- `npm run build`：通过
- `npm test`：通过（22/22）
- `./scripts/smoke/docker-health.sh http://localhost:8787`：通过
- 说明：若在 PostgreSQL 模式下看到 `pending_count > 0`，请先执行 `npm run db:migrate`
