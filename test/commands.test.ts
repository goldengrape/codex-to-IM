import { describe, expect, it } from 'vitest';

import { parseCommand } from '../src/domain/commands';

describe('parseCommand', () => {
  it('parses one-shot job commands', () => {
    expect(
      parseCommand('/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"'),
    ).toEqual({
      kind: 'job_add_once',
      runAt: '2026-03-16 09:00',
      workspace: '/repo/project-a',
      prompt: '检查测试失败原因并总结',
    });
  });

  it('rejects malformed datetimes', () => {
    expect(
      parseCommand('/job add once "2026/03/16 09:00" "/repo/project-a" "检查测试失败原因并总结"'),
    ).toEqual({
      code: 'INVALID_DATETIME',
      message: '一次性任务时间必须是 YYYY-MM-DD HH:MM。',
    });
  });

  it('rejects unknown commands', () => {
    expect(parseCommand('/unknown')).toEqual({
      code: 'UNKNOWN_COMMAND',
      message: '未知命令：/unknown',
    });
  });
});
