"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const reducer_1 = require("../src/domain/reducer");
const types_1 = require("../src/domain/types");
function baseState(overrides = {}) {
    return (0, types_1.createInitialState)({
        acl: {
            users: ['U1'],
            chats: ['C1'],
            workspaces: ['/repo/project-a', '/repo/project-b'],
            admins: [],
        },
        ...overrides,
    });
}
function findEffect(effects, type) {
    return effects.find((effect) => effect.type === type);
}
(0, vitest_1.describe)('reducer', () => {
    (0, vitest_1.it)('rejects unauthorized users without triggering agent effects', () => {
        const decision = (0, reducer_1.next)(baseState(), {
            type: 'TelegramTextReceived',
            updateId: 1,
            userId: 'U2',
            chatId: 'C1',
            text: 'hello',
            at: '2026-03-15T09:00:00Z',
        });
        (0, vitest_1.expect)(findEffect(decision.effects, 'StartAgentThread')).toBeUndefined();
        (0, vitest_1.expect)(findEffect(decision.effects, 'StartAgentTurn')).toBeUndefined();
        (0, vitest_1.expect)(findEffect(decision.effects, 'SendTelegramMessage')).toBeDefined();
    });
    (0, vitest_1.it)('creates a binding and starts a thread for the first text message', () => {
        const decision = (0, reducer_1.next)(baseState(), {
            type: 'TelegramTextReceived',
            updateId: 1,
            userId: 'U1',
            chatId: 'C1',
            text: '检查当前仓库状态',
            at: '2026-03-15T09:00:00Z',
        });
        (0, vitest_1.expect)(decision.newState.bindings.C1.workspace).toBe('/repo/project-a');
        (0, vitest_1.expect)(findEffect(decision.effects, 'StartAgentThread')).toEqual({
            type: 'StartAgentThread',
            chatId: 'C1',
            workspace: '/repo/project-a',
        });
    });
    (0, vitest_1.it)('starts a turn after thread startup with pending input', () => {
        const first = (0, reducer_1.next)(baseState(), {
            type: 'TelegramTextReceived',
            updateId: 1,
            userId: 'U1',
            chatId: 'C1',
            text: '检查当前仓库状态',
            at: '2026-03-15T09:00:00Z',
        });
        const second = (0, reducer_1.next)(first.newState, {
            type: 'ThreadStarted',
            chatId: 'C1',
            workspace: '/repo/project-a',
            threadId: 'thread-1',
            at: '2026-03-15T09:00:01Z',
        });
        (0, vitest_1.expect)(findEffect(second.effects, 'StartAgentTurn')).toEqual({
            type: 'StartAgentTurn',
            threadId: 'thread-1',
            prompt: '检查当前仓库状态',
        });
    });
    (0, vitest_1.it)('steers the active turn when a thread is already busy', () => {
        const decision = (0, reducer_1.next)(baseState({
            bindings: {
                C1: {
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    threadId: 'thread-1',
                    activeTurnId: 'turn-1',
                    lastViewMessageId: null,
                    mode: 'interactive',
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
        }), {
            type: 'TelegramTextReceived',
            updateId: 2,
            userId: 'U1',
            chatId: 'C1',
            text: '继续排查',
            at: '2026-03-15T09:01:00Z',
        });
        (0, vitest_1.expect)(findEffect(decision.effects, 'SteerAgentTurn')).toEqual({
            type: 'SteerAgentTurn',
            threadId: 'thread-1',
            prompt: '继续排查',
        });
    });
    (0, vitest_1.it)('updates cwd and resets existing thread binding', () => {
        const decision = (0, reducer_1.next)(baseState({
            bindings: {
                C1: {
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    threadId: 'thread-1',
                    activeTurnId: 'turn-1',
                    lastViewMessageId: null,
                    mode: 'interactive',
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
        }), {
            type: 'TelegramCommandReceived',
            updateId: 2,
            userId: 'U1',
            chatId: 'C1',
            commandText: '/cwd /repo/project-b',
            at: '2026-03-15T09:02:00Z',
        });
        (0, vitest_1.expect)(decision.newState.bindings.C1.workspace).toBe('/repo/project-b');
        (0, vitest_1.expect)(decision.newState.bindings.C1.threadId).toBeNull();
        (0, vitest_1.expect)(decision.newState.bindings.C1.activeTurnId).toBeNull();
    });
    (0, vitest_1.it)('resets a session thread association', () => {
        const decision = (0, reducer_1.next)(baseState({
            bindings: {
                C1: {
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    threadId: 'thread-1',
                    activeTurnId: 'turn-1',
                    lastViewMessageId: null,
                    mode: 'interactive',
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
        }), {
            type: 'TelegramCommandReceived',
            updateId: 2,
            userId: 'U1',
            chatId: 'C1',
            commandText: '/reset',
            at: '2026-03-15T09:02:00Z',
        });
        (0, vitest_1.expect)(decision.newState.bindings.C1.threadId).toBeNull();
        (0, vitest_1.expect)(decision.newState.bindings.C1.activeTurnId).toBeNull();
    });
    (0, vitest_1.it)('creates one-shot jobs with nextRunAt', () => {
        const decision = (0, reducer_1.next)(baseState(), {
            type: 'TelegramCommandReceived',
            updateId: 3,
            userId: 'U1',
            chatId: 'C1',
            commandText: '/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"',
            at: '2026-03-15T09:00:00Z',
        });
        const job = Object.values(decision.newState.jobs)[0];
        (0, vitest_1.expect)(job).toBeDefined();
        (0, vitest_1.expect)(job.nextRunAt).toBe('2026-03-16T09:00:00Z');
    });
    (0, vitest_1.it)('does not queue the same due job twice while a run is active', () => {
        const created = (0, reducer_1.next)(baseState(), {
            type: 'TelegramCommandReceived',
            updateId: 3,
            userId: 'U1',
            chatId: 'C1',
            commandText: '/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"',
            at: '2026-03-15T09:00:00Z',
        });
        const jobId = Object.keys(created.newState.jobs)[0];
        const firstDue = (0, reducer_1.next)(created.newState, {
            type: 'JobDue',
            jobId,
            at: '2026-03-16T09:00:00Z',
        });
        const secondDue = (0, reducer_1.next)(firstDue.newState, {
            type: 'JobDue',
            jobId,
            at: '2026-03-16T09:00:01Z',
        });
        (0, vitest_1.expect)(Object.keys(firstDue.newState.runs)).toHaveLength(1);
        (0, vitest_1.expect)(secondDue.newState).toEqual(firstDue.newState);
    });
    (0, vitest_1.it)('advances recurring jobs and clears active turn after completion', () => {
        const state = baseState({
            bindings: {
                C1: {
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    threadId: 'thread-1',
                    activeTurnId: 'turn-1',
                    lastViewMessageId: null,
                    mode: 'interactive',
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
            jobs: {
                'job-1': {
                    jobId: 'job-1',
                    name: 'daily summary',
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    prompt: '总结仓库状态',
                    schedule: { kind: 'daily', hour: 9, minute: 0, timezone: 'UTC' },
                    enabled: true,
                    nextRunAt: '2026-03-16T09:00:00Z',
                    lastRunAt: null,
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
            runs: {
                'run-1': {
                    runId: 'run-1',
                    jobId: 'job-1',
                    threadId: 'thread-1',
                    turnId: 'turn-1',
                    status: 'running',
                    startedAt: '2026-03-16T09:00:00Z',
                    completedAt: null,
                    error: null,
                    resultSummary: null,
                },
            },
            activeRunByJobId: {
                'job-1': 'run-1',
            },
        });
        const decision = (0, reducer_1.next)(state, {
            type: 'TurnCompleted',
            threadId: 'thread-1',
            turnId: 'turn-1',
            status: 'completed',
            error: null,
            at: '2026-03-16T09:05:00Z',
        });
        (0, vitest_1.expect)(decision.newState.bindings.C1.activeTurnId).toBeNull();
        (0, vitest_1.expect)(decision.newState.activeRunByJobId['job-1']).toBeNull();
        (0, vitest_1.expect)(decision.newState.jobs['job-1'].nextRunAt).toBe('2026-03-17T09:00:00Z');
    });
    (0, vitest_1.it)('stores approvals and keeps resolution idempotent', () => {
        const withApproval = (0, reducer_1.next)(baseState({
            bindings: {
                C1: {
                    chatId: 'C1',
                    workspace: '/repo/project-a',
                    threadId: 'thread-1',
                    activeTurnId: 'turn-1',
                    lastViewMessageId: null,
                    mode: 'interactive',
                    createdAt: '2026-03-15T09:00:00Z',
                    updatedAt: '2026-03-15T09:00:00Z',
                },
            },
        }), {
            type: 'ApprovalRequested',
            approvalId: 'approval-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
            title: 'Allow shell',
            detail: 'Run tests',
            at: '2026-03-15T09:05:00Z',
        });
        (0, vitest_1.expect)(withApproval.newState.pendingApprovals['approval-1']?.status).toBe('pending');
        const resolved = (0, reducer_1.next)(withApproval.newState, {
            type: 'TelegramApprovalClicked',
            updateId: 8,
            userId: 'U1',
            chatId: 'C1',
            approvalId: 'approval-1',
            decision: 'approved',
            at: '2026-03-15T09:06:00Z',
        });
        (0, vitest_1.expect)(findEffect(resolved.effects, 'ReplyApprovalToAgent')).toEqual({
            type: 'ReplyApprovalToAgent',
            approvalId: 'approval-1',
            decision: 'approved',
        });
        const repeated = (0, reducer_1.next)(resolved.newState, {
            type: 'TelegramApprovalClicked',
            updateId: 9,
            userId: 'U1',
            chatId: 'C1',
            approvalId: 'approval-1',
            decision: 'approved',
            at: '2026-03-15T09:07:00Z',
        });
        (0, vitest_1.expect)(repeated.effects).toEqual([]);
    });
    (0, vitest_1.it)('marks interrupted runs as failed during recovery', () => {
        const recovered = (0, reducer_1.recoverState)(baseState({
            runs: {
                'run-1': {
                    runId: 'run-1',
                    jobId: 'job-1',
                    threadId: 'thread-1',
                    turnId: 'turn-1',
                    status: 'running',
                    startedAt: '2026-03-16T09:00:00Z',
                    completedAt: null,
                    error: null,
                    resultSummary: null,
                },
            },
            activeRunByJobId: {
                'job-1': 'run-1',
            },
            processedUpdateIds: {
                C1: 99,
            },
        }), '2026-03-16T09:10:00Z');
        (0, vitest_1.expect)(recovered.runs['run-1'].status).toBe('failed');
        (0, vitest_1.expect)(recovered.runs['run-1'].error).toBe('interrupted_by_restart');
        (0, vitest_1.expect)(recovered.processedUpdateIds.C1).toBe(99);
        (0, vitest_1.expect)(recovered.activeRunByJobId['job-1']).toBeNull();
    });
});
