import type { AppState, ChatId } from './types';

export function hasAtMostOneActiveTurnPerChat(state: AppState): boolean {
  return Object.values(state.bindings).every((binding) => binding.activeTurnId === null || typeof binding.activeTurnId === 'string');
}

export function hasAtMostOneActiveRunPerJob(state: AppState): boolean {
  return Object.entries(state.activeRunByJobId).every(([jobId, runId]) => {
    if (runId == null) {
      return true;
    }
    return state.runs[runId]?.jobId === jobId && isActiveRunStatus(state.runs[runId].status);
  });
}

export function isApprovalResolutionIdempotent(state: AppState): boolean {
  return Object.values(state.pendingApprovals).every((approval) => {
    if (approval.status === 'pending') {
      return state.resolvedApprovalIds[approval.approvalId] === undefined;
    }
    return state.resolvedApprovalIds[approval.approvalId] === true;
  });
}

export function tracksProcessedUpdate(state: AppState, chatId: ChatId, updateId: number): boolean {
  return (state.processedUpdateIds[chatId] ?? -1) >= updateId;
}

function isActiveRunStatus(status: AppState['runs'][string]['status']): boolean {
  return status === 'pending' || status === 'queued' || status === 'running' || status === 'waiting_approval';
}
