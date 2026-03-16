import { describe, expect, it } from 'vitest';

import { mapAgentNotificationToEvent } from '../src/adapters/codex-gateway';
import { mapTelegramUpdateToEvent } from '../src/adapters/telegram-bot';

describe('adapters', () => {
  it('maps Telegram commands to domain events', () => {
    expect(
      mapTelegramUpdateToEvent(
        {
          update_id: 10,
          message: {
            message_id: 1,
            from: { id: 7 },
            chat: { id: 99 },
            text: '/status',
          },
        },
        '2026-03-15T09:00:00Z',
      ),
    ).toEqual({
      type: 'TelegramCommandReceived',
      updateId: 10,
      userId: '7',
      chatId: '99',
      commandText: '/status',
      at: '2026-03-15T09:00:00Z',
    });
  });

  it('maps agent notifications to domain events', () => {
    expect(
      mapAgentNotificationToEvent(
        {
          kind: 'approval_requested',
          approvalId: 'approval-1',
          threadId: 'thread-1',
          turnId: 'turn-1',
          title: 'Allow shell',
          detail: 'Run tests',
        },
        '2026-03-15T09:00:00Z',
      ),
    ).toEqual({
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
