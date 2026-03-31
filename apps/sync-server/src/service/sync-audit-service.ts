export interface AuditEntry {
  request_id: string;
  action: string;
  space_id: string;
  device_id?: string;
  base_version?: number;
  head_before?: number;
  head_after?: number;
  file_changed?: number;
  conflict_count?: number;
  status_code: number;
  created_at: string;
}

export interface AuditSink {
  save(entry: AuditEntry): Promise<void>;
}

export class SyncAuditService {
  private readonly entries: AuditEntry[] = [];

  constructor(private readonly sink?: AuditSink) {}

  async log(entry: Omit<AuditEntry, "created_at">): Promise<void> {
    const next = { ...entry, created_at: new Date().toISOString() };
    this.entries.push(next);
    if (this.sink) {
      await this.sink.save(next);
    }
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }
}
