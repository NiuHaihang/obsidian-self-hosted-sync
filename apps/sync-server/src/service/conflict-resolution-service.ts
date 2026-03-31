import type { ResolveRequest, SyncCommitService } from "./sync-commit-service.js";

export class ConflictResolutionService {
  constructor(private readonly syncCommitService: SyncCommitService) {}

  async resolve(spaceId: string, conflictSetId: string, payload: ResolveRequest, requestId: string) {
    return this.syncCommitService.resolveConflicts(spaceId, conflictSetId, payload, requestId);
  }
}
