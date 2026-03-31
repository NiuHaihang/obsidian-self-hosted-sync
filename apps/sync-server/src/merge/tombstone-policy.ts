import type { ChangeOperation } from "../repository/sync-repository.js";

export interface Tombstone {
  path: string;
  delete_version: number;
  deleted_by_device_id: string;
  created_at: Date;
  expires_at: Date;
}

export function isExplicitDelete(op: ChangeOperation): boolean {
  return op.op_type === "delete";
}

export function createTombstone(
  path: string,
  version: number,
  deletedByDeviceId: string,
  ttlDays = 45,
  now = new Date()
): Tombstone {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  return {
    path,
    delete_version: version,
    deleted_by_device_id: deletedByDeviceId,
    created_at: now,
    expires_at: expiresAt
  };
}

export function shouldPurgeTombstone(
  tombstone: Tombstone,
  now = new Date(),
  activeClientCount = 0,
  maxInactiveDays = 30
): boolean {
  const inactiveSafety = activeClientCount === 0;
  const staleForMs = now.getTime() - tombstone.created_at.getTime();
  const staleForDays = staleForMs / (1000 * 60 * 60 * 24);

  return now >= tombstone.expires_at && (inactiveSafety || staleForDays > maxInactiveDays);
}
