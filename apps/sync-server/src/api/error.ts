import { ERROR_CODES, type ErrorCode, type ErrorEnvelope } from "../../../../packages/shared-contracts/types/errors.js";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    retryable = false,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function toErrorEnvelope(error: unknown, traceId?: string): ErrorEnvelope {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
        trace_id: traceId
      }
    };
  }

  return {
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "Unexpected internal error",
      retryable: false,
      trace_id: traceId
    }
  };
}
