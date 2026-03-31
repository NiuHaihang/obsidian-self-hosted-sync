import { Buffer } from "node:buffer";
import type { ContentEncoding } from "../repository/sync-repository.interface.js";

export const BINARY_MARKER_PREFIX = "__SHS_BINARY_B64__:";

export function decodeTransportContent(contentB64?: string | null, encoding?: ContentEncoding): string {
  if (!contentB64) {
    return "";
  }

  if (encoding === "binary_base64") {
    return `${BINARY_MARKER_PREFIX}${contentB64}`;
  }

  return Buffer.from(contentB64, "base64").toString("utf8");
}

export function encodeSnapshotValueForTransport(snapshotValue: string): {
  content_b64: string;
  content_encoding: ContentEncoding;
} {
  if (snapshotValue.startsWith(BINARY_MARKER_PREFIX)) {
    return {
      content_b64: snapshotValue.slice(BINARY_MARKER_PREFIX.length),
      content_encoding: "binary_base64"
    };
  }

  return {
    content_b64: Buffer.from(snapshotValue, "utf8").toString("base64"),
    content_encoding: "utf8"
  };
}
