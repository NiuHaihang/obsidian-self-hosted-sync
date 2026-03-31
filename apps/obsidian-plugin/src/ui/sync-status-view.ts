export type SyncState = "idle" | "syncing" | "success" | "error" | "conflict";

export interface SyncStatus {
  state: SyncState;
  message: string;
  updatedAt: string;
  conflictSetId?: string;
}

export class SyncStatusViewModel {
  private status: SyncStatus = {
    state: "idle",
    message: "等待同步",
    updatedAt: new Date().toISOString()
  };

  setSyncing(): void {
    this.status = {
      state: "syncing",
      message: "同步进行中",
      updatedAt: new Date().toISOString(),
      conflictSetId: undefined
    };
  }

  setSuccess(message = "同步成功"): void {
    this.status = {
      state: "success",
      message,
      updatedAt: new Date().toISOString(),
      conflictSetId: undefined
    };
  }

  setError(message: string): void {
    this.status = {
      state: "error",
      message,
      updatedAt: new Date().toISOString(),
      conflictSetId: undefined
    };
  }

  setConflict(conflictSetId?: string, message?: string): void {
    this.status = {
      state: "conflict",
      message: message ?? (conflictSetId ? `存在未解决冲突：${conflictSetId}` : "存在未解决冲突"),
      updatedAt: new Date().toISOString(),
      conflictSetId
    };
  }

  getStatus(): SyncStatus {
    return this.status;
  }
}
