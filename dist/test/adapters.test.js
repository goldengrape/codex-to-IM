"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const codex_gateway_1 = require("../src/adapters/codex-gateway");
const telegram_bot_1 = require("../src/adapters/telegram-bot");
(0, vitest_1.describe)('adapters', () => {
    (0, vitest_1.it)('maps Telegram commands to domain events', () => {
        (0, vitest_1.expect)((0, telegram_bot_1.mapTelegramUpdateToEvent)({
            update_id: 10,
            message: {
                message_id: 1,
                from: { id: 7 },
                chat: { id: 99 },
                text: '/status',
            },
        }, '2026-03-15T09:00:00Z')).toEqual({
            type: 'TelegramCommandReceived',
            updateId: 10,
            userId: '7',
            chatId: '99',
            commandText: '/status',
            at: '2026-03-15T09:00:00Z',
        });
    });
    (0, vitest_1.it)('maps agent notifications to domain events', () => {
        (0, vitest_1.expect)((0, codex_gateway_1.mapAgentNotificationToEvent)({
            kind: 'approval_requested',
            approvalId: 'approval-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
            title: 'Allow shell',
            detail: 'Run tests',
        }, '2026-03-15T09:00:00Z')).toEqual({
            type: 'ApprovalRequested',
            approvalId: 'approval-1',
            threadId: 'thread-1',
            turnId: 'turn-1',
            title: 'Allow shell',
            detail: 'Run tests',
            at: '2026-03-15T09:00:00Z',
        });
    });
});
