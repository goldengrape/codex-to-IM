import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from '../src/adapters/sqlite-store';
import { boot } from '../src/app/bootstrap';
import type { DomainEvent, ISOTime } from '../src/domain/types';
import type { AgentPort } from '../src/ports/agent';
import type { ClockPort } from '../src/ports/clock';
import type { LockPort } from '../src/ports/lock';
import type { TelegramPort } from '../src/ports/telegram';

class FakeTelegram implements TelegramPort {
  readonly messages: Array<{ chatId: string; text: string }> = [];

  async pollUpdates(): Promise<unknown[]> {
    return [];
  }

  async sendMessage(chatId: string, text: string): Promise<{ messageId: string }> {
    this.messages.push({ chatId, text });
    return { messageId: `message-${this.messages.length}` };
  }

  async editMessage(): Promise<void> {}

  async sendApproval(chatId: string, _approvalId: string, title: string, detail: string): Promise<{ messageId: string }> {
    this.messages.push({ chatId, text: `${title}\n${detail}` });
    return { messageId: `message-${this.messages.length}` };
  }
}

class FakeAgent implements AgentPort {
  readonly startThreadCalls: string[] = [];
  readonly startTurnCalls: Array<{ threadId: string; prompt: string }> = [];
  private listener: ((event: DomainEvent) => void) | null = null;

  async initialize(): Promise<void> {}

  async startThread(input: { workspace: string }): Promise<{ threadId: string }> {
    this.startThreadCalls.push(input.workspace);
    return { threadId: 'thread-1' };
  }

  async startTurn(input: { threadId: string; prompt: string }): Promise<{ turnId: string }> {
    this.startTurnCalls.push(input);
    return { turnId: 'turn-1' };
  }

  async steerTurn(): Promise<void> {}

  async replyApproval(): Promise<void> {}

  onNotification(cb: (event: DomainEvent) => void): () => void {
    this.listener = cb;
    return () => {
      this.listener = null;
    };
  }
}

class FakeClock implements ClockPort {
  constructor(private readonly value: ISOTime) {}

  now(): ISOTime {
    return this.value;
  }

  onTick(): () => void {
    return () => {};
  }
}

class FakeLock implements LockPort {
  async acquireJobLock(): Promise<boolean> {
    return true;
  }

  async releaseJobLock(): Promise<void> {}
}

describe('runtime', () => {
  it('bootstraps and executes the thread-start -> turn-start flow', async () => {
    const telegram = new FakeTelegram();
    const agent = new FakeAgent();
    const persistence = new InMemoryPersistenceStore();
    const runtime = await boot(
      {
        acl: {
          users: ['U1'],
          chats: ['C1'],
          workspaces: ['/repo/project-a'],
          admins: [],
        },
      },
      {
        telegram,
        agent,
        persistence,
        clock: new FakeClock('2026-03-15T09:00:00Z'),
        lock: new FakeLock(),
      },
    );

    await runtime.dispatch({
      type: 'TelegramTextReceived',
      updateId: 1,
      userId: 'U1',
      chatId: 'C1',
      text: '检查当前仓库状态',
      at: '2026-03-15T09:00:00Z',
    });

    expect(agent.startThreadCalls).toEqual(['/repo/project-a']);
    expect(agent.startTurnCalls).toEqual([{ threadId: 'thread-1', prompt: '检查当前仓库状态' }]);
    expect(runtime.getState().bindings.C1.threadId).toBe('thread-1');
    expect(runtime.getState().bindings.C1.activeTurnId).toBe('turn-1');
  });
});
