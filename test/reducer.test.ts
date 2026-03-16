import { describe, expect, it } from 'vitest';

import { next, recoverState } from '../src/domain/reducer';
import { createInitialState, type AppState, type DomainEvent } from '../src/domain/types';

function baseState(overrides: Partial<AppState> = {}): AppState {
  return createInitialState({
    acl: {
      users: ['U1'],
      chats: ['C1'],
      workspaces: ['/repo/project-a', '/repo/project-b'],
      admins: [],
    },
    ...overrides,
  });
}

function findEffect<T extends { type: string }>(effects: T[], type: T['type']) {
  return effects.find((effect) => effect.type === type);
}

describe('reducer', () => {
  it('rejects unauthorized users without triggering agent effects', () => {
    const decision = next(
      baseState(),
      {
        type: 'TelegramTextReceived',
        updateId: 1,
        userId: 'U2',
        chatId: 'C1',
        text: 'hello',
        at: '2026-03-15T09:00:00Z',
      },
    );

    expect(findEffect(decision.effects, 'StartAgentThread')).toBeUndefined();
    expect(findEffect(decision.effects, 'StartAgentTurn')).toBeUndefined();
    expect(findEffect(decision.effects, 'SendTelegramMessage')).toBeDefined();
  });

  it('creates a binding and starts a thread for the first text message', () => {
    const decision = next(
      baseState(),
      {
        type: 'TelegramTextReceived',
        updateId: 1,
        userId: 'U1',
        chatId: 'C1',
        text: '检查当前仓库状态',
        at: '2026-03-15T09:00:00Z',
      },
    );

    expect(decision.newState.bindings.C1.workspace).toBe('/repo/project-a');
    expect(findEffect(decision.effects, 'StartAgentThread')).toEqual({
      type: 'StartAgentThread',
      chatId: 'C1',
      workspace: '/repo/project-a',
    });
  });

  it('starts a turn after thread startup with pending input', () => {
    const first = next(
      baseState(),
      {
        type: 'TelegramTextReceived',
        updateId: 1,
        userId: 'U1',
        chatId: 'C1',
        text: '检查当前仓库状态',
        at: '2026-03-15T09:00:00Z',
      },
    );

    const second = next(first.newState, {
      type: 'ThreadStarted',
      chatId: 'C1',
      workspace: '/repo/project-a',
      threadId: 'thread-1',
      at: '2026-03-15T09:00:01Z',
    });

    expect(findEffect(second.effects, 'StartAgentTurn')).toEqual({
      type: 'StartAgentTurn',
      threadId: 'thread-1',
      prompt: '检查当前仓库状态',
    });
  });

  it('steers the active turn when a thread is already busy', () => {
    const decision = next(
      baseState({
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
      }),
      {
        type: 'TelegramTextReceived',
        updateId: 2,
        userId: 'U1',
        chatId: 'C1',
        text: '继续排查',
        at: '2026-03-15T09:01:00Z',
      },
    );

    expect(findEffect(decision.effects, 'SteerAgentTurn')).toEqual({
      type: 'SteerAgentTurn',
      threadId: 'thread-1',
      prompt: '继续排查',
    });
  });

  it('updates cwd and resets existing thread binding', () => {
    const decision = next(
      baseState({
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
      }),
      {
        type: 'TelegramCommandReceived',
        updateId: 2,
        userId: 'U1',
        chatId: 'C1',
        commandText: '/cwd /repo/project-b',
        at: '2026-03-15T09:02:00Z',
      },
    );

    expect(decision.newState.bindings.C1.workspace).toBe('/repo/project-b');
    expect(decision.newState.bindings.C1.threadId).toBeNull();
    expect(decision.newState.bindings.C1.activeTurnId).toBeNull();
  });

  it('resets a session thread association', () => {
    const decision = next(
      baseState({
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
      }),
      {
        type: 'TelegramCommandReceived',
        updateId: 2,
        userId: 'U1',
        chatId: 'C1',
        commandText: '/reset',
        at: '2026-03-15T09:02:00Z',
      },
    );

    expect(decision.newState.bindings.C1.threadId).toBeNull();
    expect(decision.newState.bindings.C1.activeTurnId).toBeNull();
  });

  it('creates one-shot jobs with nextRunAt', () => {
    const decision = next(
      baseState(),
      {
        type: 'TelegramCommandReceived',
        updateId: 3,
        userId: 'U1',
        chatId: 'C1',
        commandText: '/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"',
        at: '2026-03-15T09:00:00Z',
      },
    );

    const job = Object.values(decision.newState.jobs)[0];
    expect(job).toBeDefined();
    expect(job.nextRunAt).toBe('2026-03-16T09:00:00Z');
  });

  it('does not queue the same due job twice while a run is active', () => {
    const created = next(
      baseState(),
      {
        type: 'TelegramCommandReceived',
        updateId: 3,
        userId: 'U1',
        chatId: 'C1',
        commandText: '/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"',
        at: '2026-03-15T09:00:00Z',
      },
    );
    const jobId = Object.keys(created.newState.jobs)[0];

    const firstDue = next(created.newState, {
      type: 'JobDue',
      jobId,
      at: '2026-03-16T09:00:00Z',
    });
    const secondDue = next(firstDue.newState, {
      type: 'JobDue',
      jobId,
      at: '2026-03-16T09:00:01Z',
    });

    expect(Object.keys(firstDue.newState.runs)).toHaveLength(1);
    expect(secondDue.newState).toEqual(firstDue.newState);
  });

  it('advances recurring jobs and clears active turn after completion', () => {
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

    const decision = next(state, {
      type: 'TurnCompleted',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      error: null,
      at: '2026-03-16T09:05:00Z',
    });

    expect(decision.newState.bindings.C1.activeTurnId).toBeNull();
    expect(decision.newState.activeRunByJobId['job-1']).toBeNull();
    expect(decision.newState.jobs['job-1'].nextRunAt).toBe('2026-03-17T09:00:00Z');
  });

  it('stores approvals and keeps resolution idempotent', () => {
    const withApproval = next(
      baseState({
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
      }),
      {
        type: 'ApprovalRequested',
        approvalId: 'approval-1',
        threadId: 'thread-1',
        turnId: 'turn-1',
        title: 'Allow shell',
        detail: 'Run tests',
        at: '2026-03-15T09:05:00Z',
      },
    );

    expect(withApproval.newState.pendingApprovals['approval-1']?.status).toBe('pending');

    const resolved = next(withApproval.newState, {
      type: 'TelegramApprovalClicked',
      updateId: 8,
      userId: 'U1',
      chatId: 'C1',
      approvalId: 'approval-1',
      decision: 'approved',
      at: '2026-03-15T09:06:00Z',
    });

    expect(findEffect(resolved.effects, 'ReplyApprovalToAgent')).toEqual({
      type: 'ReplyApprovalToAgent',
      approvalId: 'approval-1',
      decision: 'approved',
    });

    const repeated = next(resolved.newState, {
      type: 'TelegramApprovalClicked',
      updateId: 9,
      userId: 'U1',
      chatId: 'C1',
      approvalId: 'approval-1',
      decision: 'approved',
      at: '2026-03-15T09:07:00Z',
    });

    expect(repeated.effects).toEqual([]);
  });

  it('marks interrupted runs as failed during recovery', () => {
    const recovered = recoverState(
      baseState({
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
      }),
      '2026-03-16T09:10:00Z',
    );

    expect(recovered.runs['run-1'].status).toBe('failed');
    expect(recovered.runs['run-1'].error).toBe('interrupted_by_restart');
    expect(recovered.processedUpdateIds.C1).toBe(99);
    expect(recovered.activeRunByJobId['job-1']).toBeNull();
  });
});
