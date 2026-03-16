import { describe, expect, it } from 'vitest';

import { computeNextRun, schedulerTick } from '../src/domain/scheduler';
import { createInitialState, type AppState } from '../src/domain/types';

describe('scheduler', () => {
  it('computes one-shot next runs only for future timestamps', () => {
    expect(
      computeNextRun(
        { kind: 'one_shot', runAt: '2026-03-16T09:00:00Z', timezone: 'UTC' },
        '2026-03-16T08:59:00Z',
      ),
    ).toBe('2026-03-16T09:00:00Z');

    expect(
      computeNextRun(
        { kind: 'one_shot', runAt: '2026-03-16T09:00:00Z', timezone: 'UTC' },
        '2026-03-16T09:00:00Z',
      ),
    ).toBeNull();
  });

  it('returns only due enabled jobs without active runs', () => {
    const state: AppState = createInitialState({
      jobs: {
        'job-1': {
          jobId: 'job-1',
          name: 'due',
          chatId: 'C1',
          workspace: '/repo/project-a',
          prompt: 'run',
          schedule: { kind: 'daily', hour: 9, minute: 0, timezone: 'UTC' },
          enabled: true,
          nextRunAt: '2026-03-16T09:00:00Z',
          lastRunAt: null,
          createdAt: '2026-03-15T09:00:00Z',
          updatedAt: '2026-03-15T09:00:00Z',
        },
        'job-2': {
          jobId: 'job-2',
          name: 'disabled',
          chatId: 'C1',
          workspace: '/repo/project-a',
          prompt: 'run',
          schedule: { kind: 'daily', hour: 9, minute: 0, timezone: 'UTC' },
          enabled: false,
          nextRunAt: '2026-03-16T09:00:00Z',
          lastRunAt: null,
          createdAt: '2026-03-15T09:00:00Z',
          updatedAt: '2026-03-15T09:00:00Z',
        },
      },
      activeRunByJobId: {
        'job-1': null,
        'job-2': 'run-9',
      },
    });

    expect(schedulerTick(state, '2026-03-16T09:00:00Z')).toEqual(['job-1']);
  });
});
