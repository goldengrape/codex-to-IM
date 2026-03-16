"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const commands_1 = require("../src/domain/commands");
(0, vitest_1.describe)('parseCommand', () => {
    (0, vitest_1.it)('parses one-shot job commands', () => {
        (0, vitest_1.expect)((0, commands_1.parseCommand)('/job add once "2026-03-16 09:00" "/repo/project-a" "检查测试失败原因并总结"')).toEqual({
            kind: 'job_add_once',
            runAt: '2026-03-16 09:00',
            workspace: '/repo/project-a',
            prompt: '检查测试失败原因并总结',
        });
    });
    (0, vitest_1.it)('rejects malformed datetimes', () => {
        (0, vitest_1.expect)((0, commands_1.parseCommand)('/job add once "2026/03/16 09:00" "/repo/project-a" "检查测试失败原因并总结"')).toEqual({
            code: 'INVALID_DATETIME',
            message: '一次性任务时间必须是 YYYY-MM-DD HH:MM。',
        });
    });
    (0, vitest_1.it)('rejects unknown commands', () => {
        (0, vitest_1.expect)((0, commands_1.parseCommand)('/unknown')).toEqual({
            code: 'UNKNOWN_COMMAND',
            message: '未知命令：/unknown',
        });
    });
});
