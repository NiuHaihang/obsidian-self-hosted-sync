import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Secret, SignOptions } from "jsonwebtoken";
import { ERROR_CODES } from "../../../../packages/shared-contracts/types/errors.js";
import { AppError } from "../api/error.js";

export interface AccessPayload {
  sub: string;
  did: string;
  sid: string;
}

export function signAccessToken(payload: AccessPayload, secret: string, expiresIn = "15m"): string {
  return jwt.sign(payload as object, secret as Secret, { expiresIn } as SignOptions);
}

export function signRefreshToken(payload: AccessPayload, secret: string, expiresIn = "7d"): string {
  return jwt.sign(payload as object, secret as Secret, { expiresIn } as SignOptions);
}

export function verifyAccessToken(token: string, secret: string): AccessPayload {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, secret);
  } catch (error) {
    const message = error instanceof Error && error.name === "TokenExpiredError"
      ? "Access token expired"
      : "Invalid access token";
    throw new AppError(401, ERROR_CODES.AUTH_FAILED, message, false);
  }

  if (typeof decoded === "string") {
    throw new AppError(401, ERROR_CODES.AUTH_FAILED, "Invalid token payload");
  }

  return {
    sub: String(decoded.sub ?? ""),
    did: String(decoded.did ?? ""),
    sid: String(decoded.sid ?? "")
  };
}

export async function authPreHandler(
  request: FastifyRequest,
  _reply: FastifyReply,
  secret: string
): Promise<void> {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    throw new AppError(401, ERROR_CODES.AUTH_FAILED, "Missing bearer token");
  }

  const token = auth.slice("Bearer ".length).trim();
  const payload = verifyAccessToken(token, secret);
  (request as FastifyRequest & { auth: AccessPayload }).auth = payload;
}
