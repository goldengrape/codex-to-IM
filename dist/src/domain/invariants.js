"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAtMostOneActiveTurnPerChat = hasAtMostOneActiveTurnPerChat;
exports.hasAtMostOneActiveRunPerJob = hasAtMostOneActiveRunPerJob;
exports.isApprovalResolutionIdempotent = isApprovalResolutionIdempotent;
exports.tracksProcessedUpdate = tracksProcessedUpdate;
function hasAtMostOneActiveTurnPerChat(state) {
    return Object.values(state.bindings).every((binding) => binding.activeTurnId === null || typeof binding.activeTurnId === 'string');
}
function hasAtMostOneActiveRunPerJob(state) {
    return Object.entries(state.activeRunByJobId).every(([jobId, runId]) => {
        if (runId == null) {
            return true;
        }
        return state.runs[runId]?.jobId === jobId && isActiveRunStatus(state.runs[runId].status);
    });
}
function isApprovalResolutionIdempotent(state) {
    return Object.values(state.pendingApprovals).every((approval) => {
        if (approval.status === 'pending') {
            return state.resolvedApprovalIds[approval.approvalId] === undefined;
        }
        return state.resolvedApprovalIds[approval.approvalId] === true;
    });
}
function tracksProcessedUpdate(state, chatId, updateId) {
    return (state.processedUpdateIds[chatId] ?? -1) >= updateId;
}
function isActiveRunStatus(status) {
    return status === 'pending' || status === 'queued' || status === 'running' || status === 'waiting_approval';
}
