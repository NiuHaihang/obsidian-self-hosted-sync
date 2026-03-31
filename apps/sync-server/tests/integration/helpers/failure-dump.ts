import { writeFile } from "node:fs/promises";

export interface FailureDumpInput {
  testName: string;
  requestId?: string;
  spaceId?: string;
  clientId?: string;
  baseVersion?: number;
  expectedHead?: number;
  headBefore?: number;
  headAfter?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

export async function writeFailureDump(input: FailureDumpInput): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = `apps/sync-server/tests/integration/helpers/.failure-${stamp}.json`;
  const payload = {
    ...input,
    createdAt: new Date().toISOString()
  };
  await writeFile(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}
