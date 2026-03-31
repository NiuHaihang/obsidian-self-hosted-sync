export interface SessionRecord {
  jti: string;
  expiresAt: Date;
  revokedAt?: Date;
}

export function pruneExpiredOrRevokedSessions(
  sessions: SessionRecord[],
  now = new Date()
): SessionRecord[] {
  return sessions.filter((session) => {
    if (session.revokedAt) {
      return false;
    }

    return session.expiresAt > now;
  });
}
