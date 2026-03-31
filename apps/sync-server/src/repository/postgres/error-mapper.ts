import { ERROR_CODES } from "../../../../../packages/shared-contracts/types/errors.js";
import { AppError } from "../../api/error.js";

export interface PgErrorLike {
  code?: string;
  message?: string;
  detail?: string;
}

export interface PgRetryLog {
  level: "warn" | "error";
  message: string;
  context: Record<string, unknown>;
}

export type PgRetryLogger = (log: PgRetryLog) => void;

export function mapPgError(error: unknown): AppError {
  const pg = (error ?? {}) as PgErrorLike;
  const detail = pg.detail ?? pg.message ?? "postgres operation failed";

  if (pg.code === "40001" || pg.code === "40P01") {
    return new AppError(409, ERROR_CODES.MERGE_CONFLICT, "Transaction retry required", true, {
      pg_code: pg.code,
      detail
    });
  }

  if (pg.code === "23505") {
    return new AppError(409, ERROR_CODES.INVALID_CHANGESET, "Unique constraint violated", false, {
      pg_code: pg.code,
      detail
    });
  }

  return new AppError(500, ERROR_CODES.INTERNAL_ERROR, "PostgreSQL error", false, {
    pg_code: pg.code,
    detail
  });
}

export async function withPgRetry<T>(
  run: () => Promise<T>,
  maxRetry = 2,
  baseDelayMs = 80,
  logger?: PgRetryLogger
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const pg = error as PgErrorLike;
      if (pg.code !== "40001" && pg.code !== "40P01") {
        logger?.({
          level: "error",
          message: "non-retryable postgres error",
          context: {
            attempt,
            pg_code: pg.code,
            detail: pg.detail ?? pg.message
          }
        });
        throw error;
      }
      lastError = error;
      if (attempt === maxRetry) {
        logger?.({
          level: "error",
          message: "postgres retry exhausted",
          context: {
            attempt,
            maxRetry,
            pg_code: pg.code,
            detail: pg.detail ?? pg.message
          }
        });
        break;
      }
      const jitter = Math.floor(Math.random() * 30);
      const waitMs = baseDelayMs * (attempt + 1) + jitter;
      logger?.({
        level: "warn",
        message: "postgres retry scheduled",
        context: {
          attempt: attempt + 1,
          maxRetry,
          wait_ms: waitMs,
          pg_code: pg.code,
          detail: pg.detail ?? pg.message
        }
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
