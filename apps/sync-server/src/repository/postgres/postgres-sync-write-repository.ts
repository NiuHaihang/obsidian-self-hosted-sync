import { PostgresSyncRepository } from "./postgres-sync-repository.js";

export class PostgresSyncWriteRepository extends PostgresSyncRepository {
  // 写路径与事务能力当前由 PostgresSyncRepository 统一承载，
  // 此类用于后续分离读写优化与 SQL 细分实现。
}
