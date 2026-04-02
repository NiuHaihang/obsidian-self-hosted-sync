import type { ChangeOperation } from "../../../sync-server/src/repository/sync-repository.js";
import type { ContentEncoding } from "./content-encoding.js";

export interface ClientRegistration {
  client_id: string;
  access_token: string;
  refresh_token: string;
  server_head: number;
  snapshot_required: boolean;
}

export interface ConflictSetItem {
  path: string;
  conflict_type: string;
  server_content: string | null;
  client_content: string | null;
  conflict_path?: string;
}

export interface ConflictSetResponse {
  conflict_set_id: string;
  status: "open" | "resolved";
  base_version: number;
  head_version: number;
  items: ConflictSetItem[];
}

export interface ResolveConflictsResponse {
  resolved: boolean;
  new_head_version: number;
}

export class SyncApiClient {
  constructor(private readonly baseUrl: string, private readonly getToken: () => string) {}

  private authHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async registerClient(spaceId: string, payload: { device_id: string; client_name: string }): Promise<ClientRegistration> {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/clients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`register client failed: ${response.status}`);
    }

    return (await response.json()) as ClientRegistration;
  }

  async pullChanges(spaceId: string, fromVersion: number) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/changes?from_version=${fromVersion}`, {
      headers: {
        ...this.authHeaders()
      }
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`pull failed: ${response.status} ${body}`);
    }
    return response.json();
  }

  async getConflictSet(spaceId: string, conflictSetId: string): Promise<ConflictSetResponse> {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/conflicts/${conflictSetId}`, {
      headers: {
        ...this.authHeaders()
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`get conflict set failed: ${response.status} ${body}`);
    }

    return (await response.json()) as ConflictSetResponse;
  }

  async pushChanges(
    spaceId: string,
    payload: {
      client_id: string;
      idempotency_key: string;
      base_version: number;
      expected_head: number;
      ops: ChangeOperation[];
    }
  ) {
    const response = await fetch(`${this.baseUrl}/v1/spaces/${spaceId}/changes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.authHeaders()
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`push failed: ${response.status} ${body}`);
    }

    return response.json();
  }

  async resolveConflicts(
    spaceId: string,
    conflictSetId: string,
    payload: {
      expected_head: number;
      resolutions: Array<{
        path: string;
        strategy: "ours" | "theirs" | "manual";
        content_b64?: string;
        content_encoding?: ContentEncoding;
        delete?: boolean;
      }>;
    }
  ): Promise<ResolveConflictsResponse> {
    const response = await fetch(
      `${this.baseUrl}/v1/spaces/${spaceId}/conflicts/${conflictSetId}/resolutions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...this.authHeaders()
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`resolve failed: ${response.status} ${body}`);
    }

    return (await response.json()) as ResolveConflictsResponse;
  }
}
