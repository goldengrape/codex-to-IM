"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APPROVAL_TTL_MS = exports.DEFAULT_TIMEZONE = void 0;
exports.createInitialState = createInitialState;
exports.DEFAULT_TIMEZONE = 'UTC';
exports.APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
function createInitialState(overrides = {}) {
    return {
        bindings: {},
        jobs: {},
        runs: {},
        pendingApprovals: {},
        processedUpdateIds: {},
        resolvedApprovalIds: {},
        activeRunByJobId: {},
        acl: {
            users: [],
            chats: [],
            workspaces: [],
            admins: [],
            ...overrides.acl,
        },
        lastRecoveryAt: null,
        version: 1,
        pendingInputsByChatId: {},
        liveViewsByThreadId: {},
        ...overrides,
    };
}
