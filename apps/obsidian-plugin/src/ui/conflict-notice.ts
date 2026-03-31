export interface ConflictNotice {
  path: string;
  message: string;
  conflictPath?: string;
}

export function formatConflictNotice(path: string, conflictPath?: string): ConflictNotice {
  return {
    path,
    conflictPath,
    message: conflictPath
      ? `检测到冲突：${path}，已保留副本 ${conflictPath}`
      : `检测到冲突：${path}，请手动处理`
  };
}
