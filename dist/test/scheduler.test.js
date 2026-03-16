"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const scheduler_1 = require("../src/domain/scheduler");
const types_1 = require("../src/domain/types");
(0, vitest_1.describe)('scheduler', () => {
    (0, vitest_1.it)('computes one-shot next runs only for future timestamps', () => {
        (0, vitest_1.expect)((0, scheduler_1.computeNextRun)({ kind: 'one_shot', runAt: '2026-03-16T09:00:00Z', timezone: 'UTC' }, '2026-03-16T08:59:00Z')).toBe('2026-03-16T09:00:00Z');
        (0, vitest_1.expect)((0, scheduler_1.computeNextRun)({ kind: 'one_shot', runAt: '2026-03-16T09:00:00Z', timezone: 'UTC' }, '2026-03-16T09:00:00Z')).toBeNull();
    });
    (0, vitest_1.it)('returns only due enabled jobs without active runs', () => {
        const state = (0, types_1.createInitialState)({
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
        (0, vitest_1.expect)((0, scheduler_1.schedulerTick)(state, '2026-03-16T09:00:00Z')).toEqual(['job-1']);
    });
});
