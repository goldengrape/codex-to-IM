"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const sqlite_store_1 = require("../src/adapters/sqlite-store");
const bootstrap_1 = require("../src/app/bootstrap");
class FakeTelegram {
    messages = [];
    async pollUpdates() {
        return [];
    }
    async sendMessage(chatId, text) {
        this.messages.push({ chatId, text });
        return { messageId: `message-${this.messages.length}` };
    }
    async editMessage() { }
    async sendApproval(chatId, _approvalId, title, detail) {
        this.messages.push({ chatId, text: `${title}\n${detail}` });
        return { messageId: `message-${this.messages.length}` };
    }
}
class FakeAgent {
    startThreadCalls = [];
    startTurnCalls = [];
    listener = null;
    async initialize() { }
    async startThread(input) {
        this.startThreadCalls.push(input.workspace);
        return { threadId: 'thread-1' };
    }
    async startTurn(input) {
        this.startTurnCalls.push(input);
        return { turnId: 'turn-1' };
    }
    async steerTurn() { }
    async replyApproval() { }
    onNotification(cb) {
        this.listener = cb;
        return () => {
            this.listener = null;
        };
    }
}
class FakeClock {
    value;
    constructor(value) {
        this.value = value;
    }
    now() {
        return this.value;
    }
    onTick() {
        return () => { };
    }
}
class FakeLock {
    async acquireJobLock() {
        return true;
    }
    async releaseJobLock() { }
}
(0, vitest_1.describe)('runtime', () => {
    (0, vitest_1.it)('bootstraps and executes the thread-start -> turn-start flow', async () => {
        const telegram = new FakeTelegram();
        const agent = new FakeAgent();
        const persistence = new sqlite_store_1.InMemoryPersistenceStore();
        const runtime = await (0, bootstrap_1.boot)({
            acl: {
                users: ['U1'],
                chats: ['C1'],
                workspaces: ['/repo/project-a'],
                admins: [],
            },
        }, {
            telegram,
            agent,
            persistence,
            clock: new FakeClock('2026-03-15T09:00:00Z'),
            lock: new FakeLock(),
        });
        await runtime.dispatch({
            type: 'TelegramTextReceived',
            updateId: 1,
            userId: 'U1',
            chatId: 'C1',
            text: '检查当前仓库状态',
            at: '2026-03-15T09:00:00Z',
        });
        (0, vitest_1.expect)(agent.startThreadCalls).toEqual(['/repo/project-a']);
        (0, vitest_1.expect)(agent.startTurnCalls).toEqual([{ threadId: 'thread-1', prompt: '检查当前仓库状态' }]);
        (0, vitest_1.expect)(runtime.getState().bindings.C1.threadId).toBe('thread-1');
        (0, vitest_1.expect)(runtime.getState().bindings.C1.activeTurnId).toBe('turn-1');
    });
});
