export const ERROR_CODES = {
  AUTH_FAILED: "AUTH_FAILED",
  FORBIDDEN: "FORBIDDEN",
  MERGE_CONFLICT: "MERGE_CONFLICT",
  VERSION_TOO_OLD: "VERSION_TOO_OLD",
  EXPECTED_HEAD_MISMATCH: "EXPECTED_HEAD_MISMATCH",
  INVALID_CHANGESET: "INVALID_CHANGESET",
  DB_NOT_READY: "DB_NOT_READY",
  MIGRATION_PENDING: "MIGRATION_PENDING",
  PG_QUERY_FAILED: "PG_QUERY_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR"
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
    trace_id?: string;
  };
}
