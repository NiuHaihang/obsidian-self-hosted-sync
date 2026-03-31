export type MergeResultType = "fast_forward" | "merged" | "conflict";

export type ConflictType =
  | "content_diverged"
  | "delete_vs_modify"
  | "rename_conflict"
  | "binary_conflict";

export interface MergeConflictItem {
  path: string;
  conflict_type: ConflictType;
  server_content: string | null;
  client_content: string | null;
  conflict_path?: string;
}

export interface MergeOptions {
  clientId: string;
  timestamp?: Date;
}

export interface MergeOutput {
  snapshot: Record<string, string>;
  mergeResult: MergeResultType;
  conflicts: MergeConflictItem[];
}

function toSet(snapshot: Record<string, string>): Set<string> {
  return new Set(Object.keys(snapshot));
}

function readPath(snapshot: Record<string, string>, path: string): string | null {
  return path in snapshot ? snapshot[path] : null;
}

function writePath(snapshot: Record<string, string>, path: string, value: string | null): void {
  if (value === null) {
    delete snapshot[path];
    return;
  }

  snapshot[path] = value;
}

function makeConflictPath(path: string, clientId: string, timestamp: Date): string {
  const lastSlash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");

  const hasFileExt = dot > lastSlash;
  const stem = hasFileExt ? path.slice(0, dot) : path;
  const ext = hasFileExt ? path.slice(dot) : "";
  const stamp = timestamp.toISOString().replace(/[-:]/g, "").replace(".", "").slice(0, 15);
  return `${stem}.conflict.${stamp}.${clientId.slice(0, 8)}${ext}`;
}

function snapshotsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const key of aKeys) {
    if (!(key in b)) {
      return false;
    }
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}

export function mergeSnapshots(
  base: Record<string, string>,
  local: Record<string, string>,
  remote: Record<string, string>,
  options: MergeOptions
): MergeOutput {
  const timestamp = options.timestamp ?? new Date();
  const result: Record<string, string> = { ...remote };
  const conflicts: MergeConflictItem[] = [];

  const allPaths = new Set<string>([...toSet(base), ...toSet(local), ...toSet(remote)]);

  for (const path of allPaths) {
    const baseValue = readPath(base, path);
    const localValue = readPath(local, path);
    const remoteValue = readPath(remote, path);

    if (localValue === remoteValue) {
      writePath(result, path, localValue);
      continue;
    }

    if (baseValue === remoteValue) {
      writePath(result, path, localValue);
      continue;
    }

    if (baseValue === localValue) {
      writePath(result, path, remoteValue);
      continue;
    }

    if (localValue === null && remoteValue !== null) {
      writePath(result, path, remoteValue);
      conflicts.push({
        path,
        conflict_type: "delete_vs_modify",
        server_content: remoteValue,
        client_content: null
      });
      continue;
    }

    if (remoteValue === null && localValue !== null) {
      writePath(result, path, localValue);
      conflicts.push({
        path,
        conflict_type: "delete_vs_modify",
        server_content: null,
        client_content: localValue
      });
      continue;
    }

    if (localValue !== null && remoteValue !== null && localValue !== remoteValue) {
      writePath(result, path, remoteValue);
      const conflictPath = makeConflictPath(path, options.clientId, timestamp);
      writePath(result, conflictPath, localValue);
      conflicts.push({
        path,
        conflict_type: "content_diverged",
        server_content: remoteValue,
        client_content: localValue,
        conflict_path: conflictPath
      });
      continue;
    }

    writePath(result, path, localValue);
  }

  const mergeResult: MergeResultType = conflicts.length > 0
    ? "conflict"
    : snapshotsEqual(base, remote)
      ? "fast_forward"
      : "merged";

  return {
    snapshot: result,
    mergeResult,
    conflicts
  };
}
